#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod vault;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Arc, Mutex},
};
use tauri::{ipc::Channel, Manager, State};

#[derive(Default)]
struct Workspace(Mutex<Option<PathBuf>>);
#[derive(Default)]
struct AgentProcess {
    process: Mutex<Option<(Child, ChildStdin)>>,
    routes: Arc<Mutex<HashMap<String, Channel<Value>>>>,
}
impl Drop for AgentProcess {
    fn drop(&mut self) {
        if let Ok(slot) = self.process.get_mut() {
            if let Some((child, _)) = slot {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[tauri::command]
fn open_vault(path: String, workspace: State<Workspace>) -> Result<Value, String> {
    let root = fs::canonicalize(path).map_err(|e| e.to_string())?;
    if !root.is_dir() {
        return Err("Choose a folder".into());
    }
    let entries = vault::list(&root)?;
    *workspace.0.lock().unwrap() = Some(root.clone());
    Ok(json!({ "path": root, "entries": entries }))
}
#[tauri::command]
fn list_entries(workspace: State<Workspace>) -> Result<Vec<vault::Entry>, String> {
    let guard = workspace.0.lock().unwrap();
    vault::list(guard.as_ref().ok_or("Open a vault first")?)
}
#[tauri::command]
fn read_document(path: String, workspace: State<Workspace>) -> Result<vault::Document, String> {
    let guard = workspace.0.lock().unwrap();
    vault::read(guard.as_ref().ok_or("Open a vault first")?, &path)
}
#[tauri::command]
fn save_document(
    path: String,
    content: String,
    revision: Option<String>,
    workspace: State<Workspace>,
) -> Result<String, String> {
    let guard = workspace.0.lock().unwrap();
    vault::save(
        guard.as_ref().ok_or("Open a vault first")?,
        &path,
        &content,
        revision.as_deref(),
    )
}
#[tauri::command]
fn create_folder(path: String, workspace: State<Workspace>) -> Result<(), String> {
    let guard = workspace.0.lock().unwrap();
    vault::create_folder(guard.as_ref().ok_or("Open a vault first")?, &path)
}
#[tauri::command]
fn read_pdf(path: String, workspace: State<Workspace>) -> Result<tauri::ipc::Response, String> {
    if !path.to_lowercase().ends_with(".pdf") {
        return Err("Not a PDF".into());
    }
    let guard = workspace.0.lock().unwrap();
    let target = vault::resolve(guard.as_ref().ok_or("Open a vault first")?, &path)?;
    if fs::metadata(&target).map_err(|e| e.to_string())?.len() > 50 * 1024 * 1024 {
        return Err("PDF exceeds 50 MB".into());
    }
    Ok(tauri::ipc::Response::new(
        fs::read(target).map_err(|e| e.to_string())?,
    ))
}
#[tauri::command]
fn import_pdf(
    source: String,
    folder: String,
    workspace: State<Workspace>,
) -> Result<String, String> {
    let source = PathBuf::from(source);
    if !source
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("pdf"))
    {
        return Err("Choose a PDF file".into());
    }
    let name = source
        .file_name()
        .ok_or("Invalid filename")?
        .to_string_lossy();
    let path = if folder.is_empty() {
        name.to_string()
    } else {
        format!("{folder}/{name}")
    };
    let guard = workspace.0.lock().unwrap();
    let target = vault::resolve(guard.as_ref().ok_or("Open a vault first")?, &path)?;
    fs::create_dir_all(target.parent().unwrap()).map_err(|e| e.to_string())?;
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|e| e.to_string())?;
    let result = (|| {
        let mut input = fs::File::open(&source)?;
        std::io::copy(&mut input, &mut output)?;
        output.sync_all()
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(target);
        return Err(e.to_string());
    }
    Ok(path)
}
#[tauri::command]
fn agent_request(
    mut request: Value,
    on_event: Channel<Value>,
    app: tauri::AppHandle,
    workspace: State<Workspace>,
    agent: State<AgentProcess>,
) -> Result<(), String> {
    let id = request
        .get("id")
        .and_then(Value::as_str)
        .ok_or("Missing request id")?
        .to_string();
    let root = workspace.0.lock().unwrap().clone();
    let obj = request.as_object_mut().ok_or("Invalid request")?;
    obj.insert("root".into(), json!(root));
    let mut guard = agent.process.lock().unwrap();
    if guard
        .as_mut()
        .is_some_and(|(child, _)| child.try_wait().ok().flatten().is_some())
    {
        *guard = None;
    }
    if guard.is_none() {
        let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
        fs::create_dir_all(&data).map_err(|e| e.to_string())?;
        let packaged = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .parent()
            .unwrap()
            .join(if cfg!(windows) {
                "non-agent.exe"
            } else {
                "non-agent"
            });
        let binary = if packaged.is_file() {
            packaged
        } else if cfg!(debug_assertions) {
            let triple = if cfg!(target_os = "macos") {
                if cfg!(target_arch = "aarch64") {
                    "aarch64-apple-darwin"
                } else {
                    "x86_64-apple-darwin"
                }
            } else if cfg!(target_os = "windows") {
                "x86_64-pc-windows-msvc"
            } else {
                "x86_64-unknown-linux-gnu"
            };
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!(
                "binaries/non-agent-{triple}{}",
                if cfg!(windows) { ".exe" } else { "" }
            ))
        } else {
            std::env::current_exe()
                .map_err(|e| e.to_string())?
                .parent()
                .unwrap()
                .join(if cfg!(windows) {
                    "non-agent.exe"
                } else {
                    "non-agent"
                })
        };
        let mut child = Command::new(binary)
            .arg("--data-dir")
            .arg(data)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
        let stdin = child.stdin.take().ok_or("Agent stdin unavailable")?;
        let stdout = child.stdout.take().ok_or("Agent stdout unavailable")?;
        let routes = agent.routes.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Ok(event) = serde_json::from_str::<Value>(&line) {
                    if let Some(id) = event.get("id").and_then(Value::as_str) {
                        let terminal = matches!(
                            event.get("type").and_then(Value::as_str),
                            Some("result" | "error")
                        );
                        let mut guard = routes.lock().unwrap();
                        if let Some(channel) = guard.get(id) {
                            let _ = channel.send(event.clone());
                        }
                        if terminal {
                            guard.remove(id);
                        }
                    }
                }
            }
            for (id, channel) in routes.lock().unwrap().drain() {
                let _ = channel.send(json!({"id": id, "type": "error", "error": "Local agent stopped. Retry to restart it."}));
            }
        });
        *guard = Some((child, stdin));
    }
    let (_, stdin) = guard.as_mut().unwrap();
    agent.routes.lock().unwrap().insert(id.clone(), on_event);
    if let Err(error) = writeln!(stdin, "{}", request).and_then(|_| stdin.flush()) {
        agent.routes.lock().unwrap().remove(&id);
        return Err(error.to_string());
    }
    Ok(())
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Workspace::default())
        .manage(AgentProcess::default())
        .invoke_handler(tauri::generate_handler![
            open_vault,
            list_entries,
            read_document,
            save_document,
            create_folder,
            read_pdf,
            import_pdf,
            agent_request
        ])
        .build(tauri::generate_context!())
        .expect("Could not start Non")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                if let Some((mut child, _)) =
                    app.state::<AgentProcess>().process.lock().unwrap().take()
                {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}

#[cfg(test)]
mod agent_tests {
    use super::*;
    #[test]
    fn sidecar_responds_to_native_stdio() {
        let temp = tempfile::tempdir().unwrap();
        let binary = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries/non-agent-aarch64-apple-darwin");
        let mut child = Command::new(binary)
            .arg("--data-dir")
            .arg(temp.path())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        writeln!(
            child.stdin.as_mut().unwrap(),
            "{}",
            json!({"id":"native-test","action":"status"})
        )
        .unwrap();
        child.stdin.as_mut().unwrap().flush().unwrap();
        let stdout = child.stdout.take().unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut line = String::new();
            let _ = BufReader::new(stdout).read_line(&mut line);
            let _ = tx.send(line);
        });
        let reply = rx.recv_timeout(std::time::Duration::from_secs(5));
        let _ = child.kill();
        let _ = child.wait();
        let response: Value =
            serde_json::from_str(&reply.expect("sidecar response timed out")).unwrap();
        assert_eq!(response["type"], "result");
        assert_eq!(response["data"]["connected"], false);
    }
}
