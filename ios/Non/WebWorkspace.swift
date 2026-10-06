import Observation
import SwiftUI
import UniformTypeIdentifiers
import WebKit

@MainActor
@Observable
final class WebWorkspaceController {
    weak var webView: WKWebView?

    func send(action: String) {
        let script = "window.dispatchEvent(new CustomEvent('non:native-action',{detail:{action:'\(action)'}}))"
        webView?.evaluateJavaScript(script)
    }
}

struct WebWorkspaceView: UIViewRepresentable {
    let controller: WebWorkspaceController

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.setURLSchemeHandler(context.coordinator, forURLScheme: "non")
        configuration.userContentController.addScriptMessageHandler(
            context.coordinator,
            contentWorld: .page,
            name: "nonBridge"
        )
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: Self.bridgeScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true,
                in: .page
            )
        )

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        controller.webView = webView

        guard let indexURL = URL(string: "non://app/index.html") else {
            webView.loadHTMLString(
                "<main style='font:17px -apple-system;padding:32px'>웹 앱 번들을 찾을 수 없습니다.</main>",
                baseURL: nil
            )
            return webView
        }
        webView.load(URLRequest(url: indexURL))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        controller.webView = webView
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply, WKURLSchemeHandler {
        private let bridge = NativeBridge()

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage,
            replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void
        ) {
            guard let payload = message.body as? [String: Any] else {
                replyHandler(nil, "잘못된 네이티브 요청입니다.")
                return
            }
            Task {
                do {
                    replyHandler(try await bridge.handle(payload), nil)
                } catch {
                    replyHandler(nil, error.localizedDescription)
                }
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            if url.scheme == "non" || url.scheme == "about" {
                decisionHandler(.allow)
            } else {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            }
        }

        func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
            guard
                let requestURL = urlSchemeTask.request.url,
                requestURL.scheme == "non",
                requestURL.host == "app",
                let resourceRoot = Bundle.main.resourceURL?.appending(
                    path: "Web",
                    directoryHint: .isDirectory
                )
            else {
                urlSchemeTask.didFailWithError(WebResourceError.invalidURL)
                return
            }

            let relativePath = requestURL.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard !relativePath.isEmpty, !relativePath.split(separator: "/").contains("..") else {
                urlSchemeTask.didFailWithError(WebResourceError.invalidURL)
                return
            }
            let resourceURL = resourceRoot.appending(path: relativePath).standardizedFileURL
            guard resourceURL.path.hasPrefix(resourceRoot.standardizedFileURL.path + "/") else {
                urlSchemeTask.didFailWithError(WebResourceError.invalidURL)
                return
            }

            do {
                let data = try Data(contentsOf: resourceURL)
                let mimeType = UTType(filenameExtension: resourceURL.pathExtension)?.preferredMIMEType
                    ?? "application/octet-stream"
                let response = URLResponse(
                    url: requestURL,
                    mimeType: mimeType,
                    expectedContentLength: data.count,
                    textEncodingName: mimeType.hasPrefix("text/") || mimeType == "application/javascript"
                        ? "utf-8"
                        : nil
                )
                urlSchemeTask.didReceive(response)
                urlSchemeTask.didReceive(data)
                urlSchemeTask.didFinish()
            } catch {
                urlSchemeTask.didFailWithError(error)
            }
        }

        func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {}
    }

    private static let bridgeScript = #"""
    (() => {
      window.__NON_NATIVE_IOS__ = true;
      const markPlatform = () => document.documentElement?.setAttribute('data-native-ios', '');
      markPlatform();
      document.addEventListener('DOMContentLoaded', markPlatform, { once: true });

      const call = (method, ...args) =>
        window.webkit.messageHandlers.nonBridge.postMessage({ method, args });
      const agentListeners = new Set();
      const transcriptionListeners = new Set();

      window.non = {
        vault: {
          defaultRoot: () => call('vault.defaultRoot'),
          open: (path) => call('vault.open', path),
          list: () => call('vault.list'),
          read: (path) => call('vault.read', path),
          save: (path, content, revision) => call('vault.save', path, content, revision),
          createFolder: (path) => call('vault.createFolder', path),
          readPdf: (path) => call('vault.readPdf', path),
          importPdf: (source, folder = '') => call('vault.importPdf', source, folder),
          trash: (path) => call('vault.trash', path),
          rename: (path, name) => call('vault.rename', path, name),
          move: (path, targetFolder) => call('vault.move', path, targetFolder),
          reveal: (path) => call('vault.reveal', path),
        },
        dialog: {
          chooseFolder: async () => null,
          choosePdf: async () => null,
        },
        transcription: {
          list: async () => [],
          create: async () => null,
          createLive: () => Promise.reject(new Error('오디오 전사는 macOS 앱에서 사용할 수 있습니다.')),
          setLanguage: () => Promise.reject(new Error('오디오 전사는 macOS 앱에서 사용할 수 있습니다.')),
          start: () => Promise.reject(new Error('오디오 전사는 macOS 앱에서 사용할 수 있습니다.')),
          retranscribe: () => Promise.reject(new Error('오디오 전사는 macOS 앱에서 사용할 수 있습니다.')),
          stop: () => Promise.reject(new Error('오디오 전사는 macOS 앱에서 사용할 수 있습니다.')),
          runtimeStatus: async () => ({ state: 'unavailable', progress: 0 }),
          installRuntime: () => Promise.reject(new Error('오디오 전사는 macOS 앱에서 사용할 수 있습니다.')),
          audioUrl: () => '',
          onEvent: (listener) => { transcriptionListeners.add(listener); return () => transcriptionListeners.delete(listener); },
        },
        agent: {
          request: async (request) => {
            const event = await call('agent.request', request);
            queueMicrotask(() => agentListeners.forEach((listener) => listener({ ...event, id: request.id })));
          },
          onEvent: (listener) => { agentListeners.add(listener); return () => agentListeners.delete(listener); },
        },
        skills: {
          list: async () => [],
          install: async () => null,
          setEnabled: async () => [],
          remove: async () => [],
          reveal: async () => undefined,
        },
        window: {
          setTheme: async (theme) => call('window.setTheme', theme),
          isFullScreen: async () => false,
          onFullScreenChanged: () => () => {},
          hide: async () => undefined,
          onCloseRequested: () => () => {},
          closeReady: async () => undefined,
        },
        openExternal: (url) => call('openExternal', url),
      };
    })();
    """#
}

private enum WebResourceError: LocalizedError {
    case invalidURL

    var errorDescription: String? { "올바르지 않은 웹 자원 경로입니다." }
}
