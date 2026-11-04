import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class TriageInboxModel {
    var items: [InboxKnowledgeBit] = []
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var inFlight: Set<String> = []
    var rowMessages: [String: String] = [:]
    var overwritePromptId: String?
    var draft = ""
    private var truncationTracker = TruncationTracker()

    var truncation: ListTruncation? { truncationTracker.truncation(shown: items.count) }
    var query: String?

    var visibleItems: [InboxKnowledgeBit] { InboxSearch.filter(items, query: query) }

    let counts: PendingReviewCountStore

    init(counts: PendingReviewCountStore = .shared) {
        self.counts = counts
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let list = try await APIClient.listInboxKnowledgeBits()

            items = list.items
            truncationTracker = TruncationTracker(list.truncation)
            hasLoaded = true
            rowMessages = [:]
            counts.setInbox(list.count)
        } catch is CancellationError {
            return
        } catch let error as URLError where error.code == .cancelled {
            return
        } catch {
            errorMessage = InboxMessages.listFailure(for: error)
        }
    }

    func returnToTriage(_ id: String) async {
        await run(id, doing: "send this back to triage") {
            try await APIClient.returnKnowledgeBitFromInbox(id: id)
            counts.adjust(by: 1)
        }
    }

    func discard(_ id: String) async {
        await run(id, doing: "discard this item") {
            try await APIClient.discardKnowledgeBitFromInbox(id: id)
        }
    }

    func newExample(_ id: String, overwrite: Bool = false) async {
        guard !inFlight.contains(id), let item = items.first(where: { $0.id == id }) else { return }

        if item.hasHumanExample && !overwrite {
            overwritePromptId = id

            return
        }

        inFlight.insert(id)
        rowMessages[id] = nil
        overwritePromptId = nil
        defer { inFlight.remove(id) }

        do {
            let result = try await APIClient.generateKnowledgeBitExample(id: id, overwrite: overwrite)

            replace(id) { $0.withExample(result.example, aiGeneratedAt: result.exampleAiGeneratedAt) }
        } catch {
            switch KnowledgeBitExampleOutcome.outcome(for: error) {
            case .needsOverwriteConfirmation: overwritePromptId = id
            case .message(let message): rowMessages[id] = message
            case .cancelled: break
            }
        }
    }

    func saveNote(_ item: InboxKnowledgeBit, text: String) async -> String? {
        guard let note = item.note else { return "This item can't be edited here." }

        do {
            _ = try await APIClient.editQuestionVariantNote(id: note.variantId, kind: note.kind, text: text)
            await load()

            return nil
        } catch {
            if KnowledgeManageError.isGone(error) {
                items.removeAll { $0.id == item.id }
                counts.setInbox(items.count)

                return "This item was changed elsewhere."
            }

            return KnowledgeManageError.message(for: error, action: "save your changes")
        }
    }

    private func run(_ id: String, doing action: String, _ work: () async throws -> Void) async {
        guard !inFlight.contains(id) else { return }

        inFlight.insert(id)
        rowMessages[id] = nil
        defer { inFlight.remove(id) }

        do {
            try await work()
            removeItem(id)
            counts.setInbox(items.count)
        } catch {
            if KnowledgeManageError.isGone(error) {
                removeItem(id)
                counts.setInbox(items.count)

                return
            }

            rowMessages[id] = InboxMessages.message(for: error, doing: action)
        }
    }

    private func removeItem(_ id: String) {
        if items.contains(where: { $0.id == id }) { truncationTracker.removedOne() }

        items.removeAll { $0.id == id }
    }

    private func replace(_ id: String, _ transform: (InboxKnowledgeBit) -> InboxKnowledgeBit) {
        items = items.map { $0.id == id ? transform($0) : $0 }
    }
}
