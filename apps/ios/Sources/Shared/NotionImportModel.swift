import PostAnkiAPI
import SwiftUI

enum NotionImportError {
    static func message(for error: Error) -> String {
        if case APIError.badStatus(400, _) = error {
            return "Notion couldn't open that database. Check the id and that the integration has access."
        }

        if case APIError.badStatus(500, _) = error {
            return "The server couldn't reach Notion. Try again later."
        }

        return StudyToolsError.message(for: error)
    }
}

@Observable
@MainActor
final class NotionImportModel {
    var input = ""
    var isRunning = false
    var imported = 0
    var nextCursor: String?
    var finishedMessage: String?
    var errorMessage: String?

    private var activeId: String?

    var extractedId: String? {
        let pattern = #"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{32}"#

        guard let range = input.range(of: pattern, options: .regularExpression) else { return nil }

        return String(input[range])
    }

    var canImport: Bool { extractedId != nil && !isRunning }
    var canContinue: Bool { nextCursor != nil && !isRunning }

    func start() async {
        guard canImport, let id = extractedId else { return }

        imported = 0
        nextCursor = nil
        finishedMessage = nil
        activeId = id

        await run(cursor: nil)
    }

    func continueImport() async {
        guard canContinue, activeId != nil else { return }

        await run(cursor: nextCursor)
    }

    private func run(cursor: String?) async {
        guard let activeId, !isRunning else { return }

        isRunning = true
        errorMessage = nil
        defer { isRunning = false }

        do {
            let result = try await APIClient.importNotionSource(dataSourceId: activeId, startCursor: cursor)

            imported += result.created

            if result.truncated, let next = result.nextCursor {
                nextCursor = next

                return
            }

            nextCursor = nil

            if imported > 0 {
                try? await APIClient.detectKnowledgeBits()
                finishedMessage = "New items will appear in Review once they're ready."
            } else {
                finishedMessage = "Nothing new. Everything in this database was already imported."
            }
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = NotionImportError.message(for: error)
        }
    }
}
