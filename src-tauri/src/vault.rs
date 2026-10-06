use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub path: String,
    pub name: String,
    pub kind: String,
    pub modified: u64,
    pub size: u64,
}
#[derive(Serialize)]
pub struct Document {
    pub content: String,
    pub revision: String,
}

pub fn resolve(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative);
    if relative.is_empty()
        || path
            .components()
            .any(|p| !matches!(p, Component::Normal(_)))
    {
        return Err("Invalid vault path".into());
    }
    let mut target = root.to_path_buf();
    for part in path.components() {
        target.push(part);
        if let Ok(meta) = fs::symlink_metadata(&target) {
            if meta.file_type().is_symlink() {
                return Err("Symbolic links are not supported in a vault".into());
            }
        }
    }
    Ok(target)
}

pub fn list(root: &Path) -> Result<Vec<Entry>, String> {
    fn walk(root: &Path, dir: &Path, depth: usize, entries: &mut Vec<Entry>) -> Result<(), String> {
        if depth > 24 || entries.len() > 20_000 {
            return Err("Vault exceeds the file/depth limit".into());
        }
        for item in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let item = item.map_err(|e| e.to_string())?;
            let name = item.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }
            let ty = item.file_type().map_err(|e| e.to_string())?;
            if ty.is_symlink() {
                continue;
            }
            let path = item.path();
            if ty.is_dir() {
                entries.push(Entry {
                    path: path
                        .strip_prefix(root)
                        .unwrap()
                        .to_string_lossy()
                        .replace('\\', "/"),
                    name,
                    kind: "folder".into(),
                    modified: 0,
                    size: 0,
                });
                walk(root, &path, depth + 1, entries)?;
            } else if matches!(
                path.extension()
                    .and_then(|x| x.to_str())
                    .map(|s| s.to_lowercase())
                    .as_deref(),
                Some("md" | "pdf" | "json")
            ) {
                let meta = item.metadata().map_err(|e| e.to_string())?;
                let ext = path.extension().unwrap().to_string_lossy().to_lowercase();
                if ext == "json" && !name.to_lowercase().ends_with(".note.json") {
                    if meta.len() > 8 * 1024 * 1024 {
                        continue;
                    }
                    let recognized = fs::read(&path)
                        .ok()
                        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
                        .is_some_and(|v| v["format"] == "non.note");
                    if !recognized {
                        continue;
                    }
                }
                entries.push(Entry {
                    path: path
                        .strip_prefix(root)
                        .unwrap()
                        .to_string_lossy()
                        .replace('\\', "/"),
                    kind: if path.extension().unwrap().eq_ignore_ascii_case("pdf") {
                        "pdf"
                    } else if ext == "md" {
                        "legacy"
                    } else {
                        "note"
                    }
                    .into(),
                    name,
                    size: meta.len(),
                    modified: meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0),
                });
            }
        }
        Ok(())
    }
    let mut entries = vec![];
    walk(root, root, 0, &mut entries)?;
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(entries)
}

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn read(root: &Path, path: &str) -> Result<Document, String> {
    let target = resolve(root, path)?;
    if fs::metadata(&target).map_err(|e| e.to_string())?.len() > 8 * 1024 * 1024 {
        return Err("Text file exceeds 8 MB".into());
    }
    let content = fs::read_to_string(target).map_err(|e| e.to_string())?;
    Ok(Document {
        revision: hash(content.as_bytes()),
        content,
    })
}
pub fn save(
    root: &Path,
    path: &str,
    content: &str,
    revision: Option<&str>,
) -> Result<String, String> {
    if content.len() > 8 * 1024 * 1024 {
        return Err("Text file exceeds 8 MB".into());
    }
    let extension = path.to_lowercase();
    if extension.ends_with(".json") {
        validate_note(content)?;
    } else if !extension.ends_with(".md") {
        return Err("Only Non JSON notes and Markdown files can be written".into());
    }
    let target = resolve(root, path)?;
    match fs::read(&target) {
        Ok(bytes) if revision != Some(hash(&bytes).as_str()) => {
            return Err(
                "CONFLICT: File changed outside Non. Save a copy to keep your edits.".into(),
            )
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && revision.is_some() => {
            return Err("CONFLICT: File was removed outside Non. Save a copy.".into())
        }
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.to_string()),
        _ => {}
    }
    let parent = target.parent().ok_or("Invalid path")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temp = parent.join(format!(".non-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|e| e.to_string())?;
        file.write_all(content.as_bytes())
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&temp, &target).map_err(|e| e.to_string())?;
        Ok(hash(content.as_bytes()))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

pub fn create_folder(root: &Path, path: &str) -> Result<(), String> {
    let target = resolve(root, path)?;
    if target.exists() {
        return Err("CONFLICT: A file or folder already exists at this path".into());
    }
    let parent = target.parent().ok_or("Invalid path")?;
    if !parent.is_dir() {
        return Err("Parent folder does not exist".into());
    }
    fs::create_dir(&target).map_err(|error| {
        if error.kind() == std::io::ErrorKind::AlreadyExists {
            "CONFLICT: A file or folder already exists at this path".into()
        } else {
            error.to_string()
        }
    })
}

fn validate_note(content: &str) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(content).map_err(|e| e.to_string())?;
    if value["format"] != "non.note"
        || value["schemaVersion"] != 1
        || !value["title"].is_string()
        || value["id"].as_str().is_none_or(str::is_empty)
        || !value["createdAt"].is_string()
        || !value["updatedAt"].is_string()
    {
        return Err("Invalid or unsupported Non note format".into());
    }
    fn blocks(
        value: &serde_json::Value,
        ids: &mut std::collections::HashSet<String>,
        depth: usize,
    ) -> Result<(), String> {
        if depth > 64 {
            return Err("Note nesting exceeds limit".into());
        }
        for block in value.as_array().ok_or("Invalid note blocks")? {
            let id = block["id"]
                .as_str()
                .filter(|s| !s.is_empty())
                .ok_or("Invalid block ID")?;
            if !ids.insert(id.to_owned())
                || block["type"].as_str().is_none_or(str::is_empty)
                || block.get("text").is_some_and(|v| !v.is_string())
                || block.get("props").is_some_and(|v| !v.is_object())
            {
                return Err("Invalid or duplicate note block".into());
            }
            if let Some(children) = block.get("children") {
                blocks(children, ids, depth + 1)?;
            }
        }
        Ok(())
    }
    if value.get("metadata").is_some_and(|v| !v.is_object()) {
        return Err("Invalid note metadata".into());
    }
    blocks(&value["blocks"], &mut std::collections::HashSet::new(), 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn note(title: &str) -> String {
        serde_json::json!({"format":"non.note","schemaVersion":1,"id":"note-id","title":title,"blocks":[{"id":"block-id","type":"paragraph","text":"hello", "future":{"x":1}}],"createdAt":"now","updatedAt":"now", "extension":[1,2]}).to_string()
    }
    #[test]
    fn prevents_traversal_and_links() {
        let dir = tempfile::tempdir().unwrap();
        assert!(resolve(dir.path(), "../outside.md").is_err());
        assert!(resolve(dir.path(), "/tmp/outside.md").is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink("/tmp", dir.path().join("link")).unwrap();
            assert!(resolve(dir.path(), "link/outside.md").is_err());
        }
    }
    #[test]
    fn refuses_stale_save_and_preserves_content() {
        let dir = tempfile::tempdir().unwrap();
        let rev = save(dir.path(), "Research/note.note.json", &note("first"), None).unwrap();
        fs::write(dir.path().join("Research/note.note.json"), note("external")).unwrap();
        assert!(save(
            dir.path(),
            "Research/note.note.json",
            &note("mine"),
            Some(&rev)
        )
        .unwrap_err()
        .starts_with("CONFLICT"));
        assert_eq!(
            read(dir.path(), "Research/note.note.json").unwrap().content,
            note("external")
        );
        assert!(save(
            dir.path(),
            "Research/note.note.json",
            &note("overwrite"),
            None
        )
        .is_err());
    }
    #[test]
    fn markdown_roundtrip_and_conflicts() {
        let dir = tempfile::tempdir().unwrap();
        let source =
            "\u{feff}---\r\ncustom: yes\r\n---\r\n# 제목\r\n[[Target]]  \r\n<div>keep</div>\r\n";
        let rev = save(dir.path(), "Folder/note.md", source, None).unwrap();
        assert_eq!(read(dir.path(), "Folder/note.md").unwrap().content, source);
        let next = format!("{source}\r\nmore");
        let current = save(dir.path(), "Folder/note.md", &next, Some(&rev)).unwrap();
        assert_eq!(read(dir.path(), "Folder/note.md").unwrap().content, next);
        assert!(save(dir.path(), "Folder/note.md", "stale", Some(&rev))
            .unwrap_err()
            .contains("CONFLICT"));
        fs::remove_file(dir.path().join("Folder/note.md")).unwrap();
        assert!(
            save(dir.path(), "Folder/note.md", "removed", Some(&current))
                .unwrap_err()
                .contains("CONFLICT")
        );
        assert!(save(dir.path(), "bad.html", "<h1>no</h1>", None).is_err());
        assert!(save(dir.path(), "bad.json", "# not json", None).is_err());
    }
    #[test]
    fn saves_and_lists_plain_files() {
        let dir = tempfile::tempdir().unwrap();
        let rev = save(dir.path(), "Research/note.note.json", &note("hello"), None).unwrap();
        save(
            dir.path(),
            "Research/note.note.json",
            &note("next"),
            Some(&rev),
        )
        .unwrap();
        fs::create_dir_all(dir.path().join(".non/memory")).unwrap();
        fs::create_dir_all(dir.path().join("Empty")).unwrap();
        fs::write(dir.path().join(".non/memory/one.md"), "private").unwrap();
        fs::write(dir.path().join("package.json"), "{}").unwrap();
        fs::write(dir.path().join("legacy.md"), "original").unwrap();
        let entries = list(dir.path()).unwrap();
        assert_eq!(entries.len(), 4);
        assert!(entries
            .iter()
            .any(|e| e.path == "Empty" && e.kind == "folder"));
        assert!(entries
            .iter()
            .any(|e| e.path == "legacy.md" && e.kind == "legacy"));
        assert_eq!(
            read(dir.path(), "Research/note.note.json").unwrap().content,
            note("next")
        );
        assert!(save(dir.path(), "legacy.md", "changed", None).is_err());
        assert!(save(dir.path(), "bad.note.json", "{}", None).is_err());
        let future = note("future").replace("\"schemaVersion\":1", "\"schemaVersion\":2");
        assert!(save(dir.path(), "future.note.json", &future, None).is_err());
    }
    #[test]
    fn creates_empty_folders_without_escaping_or_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("Notes")).unwrap();
        create_folder(dir.path(), "Notes/Untitled folder").unwrap();
        assert!(dir.path().join("Notes/Untitled folder").is_dir());
        assert!(create_folder(dir.path(), "Notes/Untitled folder")
            .unwrap_err()
            .starts_with("CONFLICT"));
        assert!(create_folder(dir.path(), "Missing/Child").is_err());
        assert!(create_folder(dir.path(), "../Outside").is_err());
    }
}
