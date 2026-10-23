import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class WritingCheckModel {
    static let maxLength = 5000

    let subjectId: String
    var text = ""
    var latest: WritingCheck?
    var history: [WritingCheck] = []
    var isChecking = false
    var isLoading = false
    private(set) var draftClipped = false
    var errorMessage: String?
    private var failedCheck = false
    private let drafts: UnsentDraftStore?

    private var draftKey: String { UnsentDraftStore.key("writing-check", subjectId) }

    init(subjectId: String, drafts: UnsentDraftStore? = nil) {
        self.subjectId = subjectId
        self.drafts = drafts
        text = drafts?.text(for: UnsentDraftStore.key("writing-check", subjectId)) ?? ""
    }

    func saveDraft() {
        drafts?.set(text, for: draftKey)
        draftClipped = drafts?.wasClipped(for: draftKey) ?? false
    }

    var hasInput: Bool {
        isChecking || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var canCheck: Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)

        return !isChecking && !trimmed.isEmpty && trimmed.count <= Self.maxLength
    }

    func loadHistory() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            history = try await APIClient.listWritingChecks(subjectId: subjectId)
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = PracticeError.message(for: error)
            failedCheck = false
        }
    }

    func retry() async {
        if failedCheck { await check() } else { await loadHistory() }
    }

    func check() async {
        guard canCheck else { return }

        isChecking = true
        errorMessage = nil
        failedCheck = false
        defer { isChecking = false }

        do {
            let result = try await APIClient.createWritingCheck(
                subjectId: subjectId,
                text: text.trimmingCharacters(in: .whitespacesAndNewlines)
            )

            latest = result
            drafts?.clear(draftKey)
            draftClipped = false
            history.insert(result, at: 0)
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = PracticeError.message(for: error)
            failedCheck = true
        }
    }
}
