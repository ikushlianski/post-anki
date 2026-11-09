import Foundation
import PostAnkiAPI

@Observable
@MainActor
final class TextFileImportModel {
    var isUploading = false
    var message: String?
    var errorMessage: String?
    var status: TextFileImportStatus?

    private var pollTask: Task<Void, Never>?
    private let pollInterval: Duration = .seconds(3)
    private let maxPolls = 200

    func importFile(at url: URL, subjectId: String?) async {
        guard !isUploading else { return }

        stopWatching()
        message = nil
        errorMessage = nil
        status = nil

        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        let data: Data

        do {
            data = try Data(contentsOf: url)
        } catch {
            errorMessage = "That file could not be read."

            return
        }

        if let problem = TextFileImportRules.problem(fileName: url.lastPathComponent, byteCount: data.count) {
            errorMessage = problem

            return
        }

        guard let text = String(data: data, encoding: .utf8) else {
            errorMessage = "This does not look like a plain text file."

            return
        }

        isUploading = true
        defer { isUploading = false }

        do {
            let result = try await APIClient.uploadTextFile(text: text, subjectId: subjectId)

            message = TextFileImportRules.startedText(result)

            if case .anki(let importId, _, _, _) = result { watch(importId: importId) }
        } catch {
            errorMessage = TextFileImportRules.message(for: error)
        }
    }

    func stopWatching() {
        pollTask?.cancel()
        pollTask = nil
    }

    private func watch(importId: String) {
        pollTask = Task { [weak self] in
            guard let self else { return }

            for _ in 0..<maxPolls {
                if let next = try? await APIClient.textFileImportStatus(importId: importId) {
                    guard !Task.isCancelled else { return }

                    status = next

                    if next.isFinished { return }
                }

                try? await Task.sleep(for: pollInterval)

                guard !Task.isCancelled else { return }
            }
        }
    }
}
