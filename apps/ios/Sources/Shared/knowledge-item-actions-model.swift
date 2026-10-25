import Observation
import PostAnkiAPI

@MainActor
@Observable
final class KnowledgeItemActionsModel {
    let itemId: String
    var question: String
    var answer: String
    var subjectId: String?
    var subjects: [Subject] = []
    var isBusy = false
    var message: String?

    private var variantId: String?

    init(item: KnowledgeOverviewItem) {
        itemId = item.id
        question = item.question
        answer = item.answer
        subjectId = item.subjectId
    }

    var subjectName: String? {
        subjectId.flatMap { id in subjects.first { $0.id == id }?.name }
    }

    func loadSubjects() async {
        guard subjects.isEmpty else { return }

        if let fetched = try? await APIClient.listSubjects() { subjects = fetched }
    }

    func edit(prompt: String, answer newAnswer: String) async -> String? {
        guard !isBusy else { return nil }

        isBusy = true
        defer { isBusy = false }

        do {
            let id = try await currentVariantId()
            variantId = try await APIClient.editQuestionVariant(id: id, prompt: prompt, answer: newAnswer)
            question = prompt
            answer = newAnswer
            message = nil

            return nil
        } catch {
            return KnowledgeManageError.message(for: error, action: "save this item")
        }
    }

    func move(to subject: Subject) async -> Bool {
        guard !isBusy else { return false }

        isBusy = true
        message = nil
        defer { isBusy = false }

        do {
            let result = try await APIClient.moveKnowledgeBits(ids: [itemId], subjectId: subject.id)

            guard result.moved.contains(itemId) else {
                message = "Couldn't move this item. Try again."

                return false
            }

            subjectId = subject.id

            return true
        } catch {
            message = KnowledgeManageError.message(for: error, action: "move this item")

            if case APIError.badStatus(404, "subject_not_found") = error {
                subjects = []
                await loadSubjects()
            }

            return false
        }
    }

    func delete() async -> Bool {
        guard !isBusy else { return false }

        isBusy = true
        message = nil
        defer { isBusy = false }

        do {
            let result = try await APIClient.deleteKnowledgeBits(ids: [itemId])
            let gone = result.deleted.contains(itemId) || result.skipped.contains { $0.id == itemId && $0.reason == "not_found" }

            if !gone { message = "Couldn't delete this item. Try again." }

            return gone
        } catch {
            message = KnowledgeManageError.message(for: error, action: "delete this item")

            return false
        }
    }

    private func currentVariantId() async throws -> String {
        if let variantId { return variantId }

        let variants = try await APIClient.knowledgeBitVariants(bitId: itemId)

        guard let match = variants.first(where: { $0.prompt == question && $0.answer == answer }) ?? variants.first else {
            throw APIError.badStatus(404, "not_found")
        }

        variantId = match.id

        return match.id
    }
}
