import Foundation
import UIKit

@MainActor
final class NativeBridge {
    private let vault = VaultService()

    func handle(_ payload: [String: Any]) async throws -> Any {
        guard let method = payload["method"] as? String else {
            throw BridgeError.invalidRequest
        }
        let arguments = payload["args"] as? [Any] ?? []
        switch method {
        case "vault.defaultRoot":
            return try await vault.defaultRoot()
        case "vault.open":
            return try await vault.open(path: try string(arguments, at: 0)).dictionary
        case "vault.list":
            return try await vault.list().map(\.dictionary)
        case "vault.read":
            return try await vault.read(path: try string(arguments, at: 0)).dictionary
        case "vault.save":
            return try await vault.save(
                path: try string(arguments, at: 0),
                content: try string(arguments, at: 1),
                revision: optionalString(arguments, at: 2)
            )
        case "vault.createFolder":
            try await vault.createFolder(path: try string(arguments, at: 0))
            return NSNull()
        case "vault.readPdf":
            return try await vault.readPDF(path: try string(arguments, at: 0))
        case "vault.importPdf":
            throw BridgeError.unsupported("PDF 가져오기는 다음 버전에서 지원합니다.")
        case "vault.trash":
            try await vault.trash(path: try string(arguments, at: 0))
            return NSNull()
        case "vault.rename":
            return try await vault.rename(
                path: try string(arguments, at: 0),
                name: try string(arguments, at: 1)
            )
        case "vault.move":
            return try await vault.move(
                path: try string(arguments, at: 0),
                targetFolder: try string(arguments, at: 1)
            )
        case "vault.reveal":
            return NSNull()
        case "window.setTheme":
            return NSNull()
        case "openExternal":
            guard let url = URL(string: try string(arguments, at: 0)) else {
                throw BridgeError.invalidRequest
            }
            await UIApplication.shared.open(url)
            return NSNull()
        case "agent.request":
            return agentEvent(for: arguments.first as? [String: Any])
        default:
            throw BridgeError.unsupported("지원하지 않는 요청입니다: \(method)")
        }
    }

    private func string(_ values: [Any], at index: Int) throws -> String {
        guard values.indices.contains(index), let value = values[index] as? String else {
            throw BridgeError.invalidRequest
        }
        return value
    }

    private func optionalString(_ values: [Any], at index: Int) -> String? {
        guard values.indices.contains(index), !(values[index] is NSNull) else { return nil }
        return values[index] as? String
    }

    private func agentEvent(for request: [String: Any]?) -> [String: Any] {
        let action = request?["action"] as? String ?? ""
        if ["chat:list", "chat:load", "memory:list"].contains(action) {
            return ["type": "result", "data": []]
        }
        if action == "status" || action == "auth:status" {
            return [
                "type": "result",
                "data": ["providers": [], "models": [], "selectedModel": ""]
            ]
        }
        if action == "index:query" || action == "index:rebuild" {
            return [
                "type": "result",
                "data": ["backlinks": [], "outgoing": [], "status": "ready"]
            ]
        }
        if action == "index:search" {
            return ["type": "result", "data": []]
        }
        if action == "index:resolve" {
            return [
                "type": "result",
                "data": ["status": "missing", "path": NSNull(), "candidates": []]
            ]
        }
        return [
            "type": "error",
            "error": "로컬 AI와 전사는 현재 macOS 앱에서 사용할 수 있습니다."
        ]
    }
}

enum BridgeError: LocalizedError {
    case invalidRequest
    case unsupported(String)

    var errorDescription: String? {
        switch self {
        case .invalidRequest:
            "잘못된 네이티브 요청입니다."
        case let .unsupported(message):
            message
        }
    }
}
