import CryptoKit
import Foundation

struct VaultEntry: Sendable {
    let path: String
    let name: String
    let kind: String
    let modified: Double
    let size: Int

    var dictionary: [String: Any] {
        ["path": path, "name": name, "kind": kind, "modified": modified, "size": size]
    }
}

struct VaultOpenResult: Sendable {
    let path: String
    let entries: [VaultEntry]

    var dictionary: [String: Any] {
        ["path": path, "entries": entries.map(\.dictionary)]
    }
}

struct VaultReadResult: Sendable {
    let content: String
    let revision: String

    var dictionary: [String: Any] {
        ["content": content, "revision": revision]
    }
}

actor VaultService {
    private let fileManager = FileManager.default
    private let textLimit = 8 * 1_024 * 1_024
    private let pdfLimit = 50 * 1_024 * 1_024
    private var root: URL?
    private var rootIsUbiquitous = false

    func defaultRoot() async throws -> String {
        try await rootURL().path
    }

    func open(path: String) async throws -> VaultOpenResult {
        let root = try await rootURL()
        guard path == root.path else { throw VaultError.outsideVault }
        return VaultOpenResult(path: root.path, entries: try entries(in: root))
    }

    func list() async throws -> [VaultEntry] {
        try entries(in: await rootURL())
    }

    func read(path: String) async throws -> VaultReadResult {
        let url = try await resolved(path)
        if rootIsUbiquitous { try downloadIfNeeded(url) }
        let data = rootIsUbiquitous ? try coordinatedRead(url) : try Data(contentsOf: url)
        guard data.count <= textLimit, let content = String(data: data, encoding: .utf8) else {
            throw VaultError.invalidText
        }
        return VaultReadResult(content: content, revision: revision(data))
    }

    func save(path: String, content: String, revision previousRevision: String?) async throws -> String {
        guard let data = content.data(using: .utf8), data.count <= textLimit else {
            throw VaultError.invalidText
        }
        if path.lowercased().hasSuffix(".json") {
            guard
                let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                object["format"] as? String == "non.note",
                object["schemaVersion"] as? Int == 1,
                object["blocks"] is [Any]
            else { throw VaultError.invalidNote }
        } else if !path.lowercased().hasSuffix(".md") {
            throw VaultError.unsupportedFormat
        }

        let url = try await resolved(path, allowMissingLeaf: true)
        try fileManager.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let write: (URL) throws -> Void = { targetURL in
            let current = try? Data(contentsOf: targetURL)
            if let current, previousRevision != self.revision(current) {
                throw VaultError.conflict
            }
            if current == nil, previousRevision != nil {
                throw VaultError.conflict
            }
            try data.write(to: targetURL, options: [.atomic, .completeFileProtectionUnlessOpen])
        }
        if rootIsUbiquitous { try coordinatedWrite(url, operation: write) }
        else { try write(url) }
        return revision(data)
    }

    func createFolder(path: String) async throws {
        let url = try await resolved(path, allowMissingLeaf: true)
        guard !fileManager.fileExists(atPath: url.path) else { throw VaultError.collision }
        try fileManager.createDirectory(at: url, withIntermediateDirectories: false)
    }

    func readPDF(path: String) async throws -> [Int] {
        guard path.lowercased().hasSuffix(".pdf") else { throw VaultError.unsupportedFormat }
        let url = try await resolved(path)
        if rootIsUbiquitous { try downloadIfNeeded(url) }
        let data = rootIsUbiquitous ? try coordinatedRead(url) : try Data(contentsOf: url)
        guard data.count <= pdfLimit else { throw VaultError.pdfTooLarge }
        return data.map(Int.init)
    }

    func trash(path: String) async throws {
        let source = try await resolved(path)
        let root = try await rootURL()
        let trash = root.appending(path: ".non/trash", directoryHint: .isDirectory)
        try fileManager.createDirectory(at: trash, withIntermediateDirectories: true)
        let target = trash.appending(
            path: "\(Int(Date().timeIntervalSince1970))-\(UUID().uuidString)-\(source.lastPathComponent)"
        )
        try moveItem(from: source, to: target)
    }

    func rename(path: String, name: String) async throws -> String {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard
            !cleanName.isEmpty,
            cleanName.count <= 200,
            !cleanName.hasPrefix("."),
            !cleanName.contains("/"),
            !cleanName.contains("\\")
        else { throw VaultError.invalidPath }

        let source = try await resolved(path)
        let values = try source.resourceValues(forKeys: [.isDirectoryKey])
        let suffix: String
        if values.isDirectory == true {
            suffix = ""
        } else if source.lastPathComponent.lowercased().hasSuffix(".note.json") {
            suffix = ".note.json"
        } else {
            suffix = ".\(source.pathExtension)"
        }
        let base = cleanName.lowercased().hasSuffix(suffix.lowercased())
            ? String(cleanName.dropLast(suffix.count))
            : cleanName
        guard !base.isEmpty else { throw VaultError.invalidPath }
        let target = source.deletingLastPathComponent().appending(path: base + suffix)
        guard !fileManager.fileExists(atPath: target.path) else { throw VaultError.collision }
        try moveItem(from: source, to: target)
        return try await relativePath(target)
    }

    func move(path: String, targetFolder: String) async throws -> String {
        let source = try await resolved(path)
        let folder = targetFolder.isEmpty
            ? try await rootURL()
            : try await resolved(targetFolder)
        let target = folder.appending(path: source.lastPathComponent)
        let sourcePath = source.standardizedFileURL.path
        guard !folder.standardizedFileURL.path.hasPrefix(sourcePath + "/") else {
            throw VaultError.invalidPath
        }
        guard !fileManager.fileExists(atPath: target.path) else { throw VaultError.collision }
        try moveItem(from: source, to: target)
        return try await relativePath(target)
    }

    private func rootURL() async throws -> URL {
        if let root { return root }

        let iCloudRoot = fileManager.url(forUbiquityContainerIdentifier: nil)
        let container: URL
        if let iCloudRoot {
            rootIsUbiquitous = true
            container = iCloudRoot.appending(path: "Documents/non", directoryHint: .isDirectory)
        } else {
            rootIsUbiquitous = false
            container = try fileManager.url(
                for: .documentDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            ).appending(path: "non", directoryHint: .isDirectory)
        }
        try fileManager.createDirectory(at: container, withIntermediateDirectories: true)
        self.root = container.standardizedFileURL
        return container.standardizedFileURL
    }

    private func resolved(_ path: String, allowMissingLeaf: Bool = false) async throws -> URL {
        let root = try await rootURL().standardizedFileURL
        let parts = path.split(separator: "/", omittingEmptySubsequences: false)
        guard
            !path.isEmpty,
            !path.hasPrefix("/"),
            !parts.contains(where: { $0.isEmpty || $0 == "." || $0 == ".." })
        else { throw VaultError.invalidPath }

        var cursor = root
        for (index, part) in parts.enumerated() {
            cursor.append(path: String(part))
            if allowMissingLeaf && index == parts.count - 1 { break }
            let values = try cursor.resourceValues(forKeys: [.isSymbolicLinkKey])
            if values.isSymbolicLink == true { throw VaultError.symbolicLink }
        }
        let standardized = cursor.standardizedFileURL
        guard standardized.path.hasPrefix(root.path + "/") else { throw VaultError.outsideVault }
        return standardized
    }

    private func relativePath(_ url: URL) async throws -> String {
        let root = try await rootURL().standardizedFileURL.path + "/"
        let path = url.standardizedFileURL.path
        guard path.hasPrefix(root) else { throw VaultError.outsideVault }
        return String(path.dropFirst(root.count))
    }

    private func entries(in root: URL) throws -> [VaultEntry] {
        var result: [VaultEntry] = []
        try walk(root: root, folder: "", depth: 0, result: &result)
        return result.sorted {
            $0.path.localizedStandardCompare($1.path) == .orderedAscending
        }
    }

    private func walk(
        root: URL,
        folder: String,
        depth: Int,
        result: inout [VaultEntry]
    ) throws {
        guard depth <= 24, result.count <= 20_000 else { throw VaultError.tooManyFiles }
        let directory = folder.isEmpty ? root : root.appending(path: folder, directoryHint: .isDirectory)
        let children = try fileManager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [
                .isDirectoryKey,
                .isRegularFileKey,
                .isSymbolicLinkKey,
                .fileSizeKey,
                .contentModificationDateKey,
            ],
            options: [.skipsHiddenFiles]
        )
        for child in children {
            let values = try child.resourceValues(forKeys: [
                .isDirectoryKey,
                .isRegularFileKey,
                .isSymbolicLinkKey,
                .fileSizeKey,
                .contentModificationDateKey,
            ])
            if values.isSymbolicLink == true { continue }
            let relative = folder.isEmpty
                ? child.lastPathComponent
                : "\(folder)/\(child.lastPathComponent)"
            if values.isDirectory == true {
                result.append(entry(path: relative, name: child.lastPathComponent, kind: "folder", values: values))
                try walk(root: root, folder: relative, depth: depth + 1, result: &result)
                continue
            }
            guard values.isRegularFile == true else { continue }
            let lower = child.lastPathComponent.lowercased()
            let kind: String
            if lower.hasSuffix(".pdf") { kind = "pdf" }
            else if lower.hasSuffix(".md") { kind = "legacy" }
            else if lower.hasSuffix(".note.json") { kind = "note" }
            else { continue }
            result.append(entry(path: relative, name: child.lastPathComponent, kind: kind, values: values))
        }
    }

    private func entry(
        path: String,
        name: String,
        kind: String,
        values: URLResourceValues
    ) -> VaultEntry {
        VaultEntry(
            path: path,
            name: name,
            kind: kind,
            modified: (values.contentModificationDate?.timeIntervalSince1970 ?? 0) * 1_000,
            size: values.fileSize ?? 0
        )
    }

    private func downloadIfNeeded(_ url: URL) throws {
        let values = try url.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey])
        if values.ubiquitousItemDownloadingStatus != .current {
            try fileManager.startDownloadingUbiquitousItem(at: url)
        }
    }

    private func coordinatedRead(_ url: URL) throws -> Data {
        var coordinationError: NSError?
        var result: Result<Data, Error>?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) {
            coordinatedURL in
            result = Result { try Data(contentsOf: coordinatedURL) }
        }
        if let coordinationError { throw coordinationError }
        guard let result else { throw VaultError.unavailable }
        return try result.get()
    }

    private func coordinatedWrite(_ url: URL, operation: (URL) throws -> Void) throws {
        var coordinationError: NSError?
        var operationError: Error?
        NSFileCoordinator().coordinate(writingItemAt: url, options: .forReplacing, error: &coordinationError) {
            coordinatedURL in
            do { try operation(coordinatedURL) } catch { operationError = error }
        }
        if let coordinationError { throw coordinationError }
        if let operationError { throw operationError }
    }

    private func coordinatedMove(from source: URL, to target: URL) throws {
        var coordinationError: NSError?
        var operationError: Error?
        NSFileCoordinator().coordinate(
            writingItemAt: source,
            options: .forMoving,
            writingItemAt: target,
            options: .forReplacing,
            error: &coordinationError
        ) { coordinatedSource, coordinatedTarget in
            do { try self.fileManager.moveItem(at: coordinatedSource, to: coordinatedTarget) }
            catch { operationError = error }
        }
        if let coordinationError { throw coordinationError }
        if let operationError { throw operationError }
    }

    private func moveItem(from source: URL, to target: URL) throws {
        if rootIsUbiquitous { try coordinatedMove(from: source, to: target) }
        else { try fileManager.moveItem(at: source, to: target) }
    }

    private func revision(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}

enum VaultError: LocalizedError {
    case collision
    case conflict
    case invalidNote
    case invalidPath
    case invalidText
    case outsideVault
    case pdfTooLarge
    case symbolicLink
    case tooManyFiles
    case unavailable
    case unsupportedFormat

    var errorDescription: String? {
        switch self {
        case .collision: "CONFLICT: 같은 이름의 파일 또는 폴더가 이미 있습니다."
        case .conflict: "CONFLICT: 다른 기기에서 파일이 변경되었습니다. 복사본으로 저장해 주세요."
        case .invalidNote: "지원하지 않는 Non 노트 형식입니다."
        case .invalidPath: "올바르지 않은 파일 경로입니다."
        case .invalidText: "텍스트 파일은 UTF-8, 최대 8MB여야 합니다."
        case .outsideVault: "Non 작업 공간 밖의 경로는 열 수 없습니다."
        case .pdfTooLarge: "PDF는 최대 50MB까지 열 수 있습니다."
        case .symbolicLink: "심볼릭 링크는 지원하지 않습니다."
        case .tooManyFiles: "작업 공간의 파일 수 또는 폴더 깊이 제한을 넘었습니다."
        case .unavailable: "파일을 열 수 없습니다."
        case .unsupportedFormat: "Non JSON 노트, Markdown, PDF만 지원합니다."
        }
    }
}
