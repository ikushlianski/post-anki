import Foundation
import Observation
import PostAnkiAPI

enum SharePanelState: Equatable {
    case ready
    case saving
    case saved(String)
    case failed(String)
}

@Observable
@MainActor
final class SharePanelModel {
    var text = ""
    var options: [ShareSubjectOption] = [.auto]
    var selectedTag = ShareSubjectOption.auto.tag
    var state: SharePanelState = .ready
    var subjectsUnavailable = false

    var selectedSubjectId: String? {
        options.first { $0.tag == selectedTag }?.id
    }

    var canSave: Bool {
        if case .saving = state { return false }

        if case .saved = state { return false }

        return !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func loadSubjects() async {
        do {
            options = ShareSubjectOptions.options(from: try await APIClient.listSubjects())
            subjectsUnavailable = false
        } catch {
            options = [.auto]
            subjectsUnavailable = true

            if case APIError.unauthorized = error {
                state = .failed(ShareKnowledgeMessage.signedOut)
            }
        }
    }

    func save() async -> Bool {
        state = .saving

        do {
            let draft = try ShareKnowledgeDraft(text: text, subjectId: selectedSubjectId)
            try await APIClient.saveSharedText(draft)
            state = .saved(ShareKnowledgeMessage.success(subjectId: draft.subjectId))

            return true
        } catch {
            state = .failed(ShareKnowledgeMessage.failure(for: error))

            return false
        }
    }
}
