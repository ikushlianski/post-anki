import Foundation
import PostAnkiAPI
import SwiftUI

struct ChatQueueExportSubject: Identifiable, Hashable {
    let id: String
    let name: String
}

struct ChatQueueExportFile: Identifiable, Equatable {
    let id = UUID()
    let url: URL
    let subjectName: String
}

enum ChatQueueExportSubjects {
    static func from(_ items: [ChatQueueItem]) -> [ChatQueueExportSubject] {
        var seen = Set<String>()
        var result: [ChatQueueExportSubject] = []

        for item in items {
            guard let id = item.subjectId, seen.insert(id).inserted else { continue }

            result.append(ChatQueueExportSubject(id: id, name: item.subjectName ?? "Subject"))
        }

        return result.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    static func fallbackFilename(for name: String) -> String {
        let slug = name.lowercased()
            .map { $0.isLetter || $0.isNumber ? String($0) : "-" }
            .joined()
            .split(separator: "-")
            .joined(separator: "-")

        return "chat-\(slug.isEmpty ? "subject" : slug).md"
    }
}

@Observable
@MainActor
final class ChatQueueExportModel {
    var isExporting = false
    var errorMessage: String?
    var file: ChatQueueExportFile?

    func export(_ subject: ChatQueueExportSubject) async {
        guard !isExporting else { return }

        isExporting = true
        errorMessage = nil
        defer { isExporting = false }

        do {
            let result = try await APIClient.exportChatQueueMarkdown(
                subjectId: subject.id,
                fallbackName: ChatQueueExportSubjects.fallbackFilename(for: subject.name)
            )
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)

            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)

            let url = folder.appendingPathComponent(result.filename)

            try result.markdown.write(to: url, atomically: true, encoding: .utf8)
            file = ChatQueueExportFile(url: url, subjectName: subject.name)
        } catch is CancellationError {
            return
        } catch let error as URLError where error.code == .cancelled {
            return
        } catch let error as CocoaError {
            errorMessage = "Could not prepare the file: \(error.localizedDescription)"
        } catch {
            errorMessage = ChatQueueFailure.failure(for: error).message
        }
    }

    func dismissFile() {
        if let file { try? FileManager.default.removeItem(at: file.url.deletingLastPathComponent()) }

        file = nil
    }
}
