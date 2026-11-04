import Observation
import PostAnkiAPI

@MainActor
@Observable
final class KnowledgeItemActionsModel {
    let itemId: String
    var context: String?
    var question: String
    var answer: String
    var subjectId: String?
    var subjects: [Subject] = []
    var subjectsFailed = false
    var isBusy = false
    var message: String?

    private(set) var noteSource: NoteSource?
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

    var subjectsNotice: String? {
        SubjectListNotice.moveSheetMessage(failed: subjectsFailed, subjectCount: subjects.count)
    }

    func loadSubjects() async {
        guard subjects.isEmpty else { return }

        await fetchSubjects()
    }

    func refreshFromServer() async {
        await fetchSubjects()

        await loadNoteSource()
    }

    private func fetchSubjects() async {
        do {
            subjects = try await APIClient.listSubjects()
            subjectsFailed = false
        } catch {
            if !KnowledgeManageError.isCancellation(error) { subjectsFailed = true }
        }
    }

    func loadNoteSource() async {
        guard !isBusy else { return }

        noteSource = try? await APIClient.knowledgeBitNoteSource(bitId: itemId)
    }

    func prepareEdit() async -> Bool {
        guard !isBusy else { return false }

        do {
            noteSource = try await APIClient.knowledgeBitNoteSource(bitId: itemId)
            message = nil

            return true
        } catch {
            noteSource = nil

            guard !KnowledgeManageError.isCancellation(error) else { return false }

            message = "Couldn't load this item's note, so it can't be edited right now. Try again."

            return false
        }
    }

    func editNote(_ text: String) async -> String? {
        guard !isBusy, let source = noteSource else { return nil }

        isBusy = true
        defer { isBusy = false }

        do {
            let id = try await APIClient.editQuestionVariantNote(id: source.variantId, kind: source.kind, text: text)
            noteSource = NoteSource(variantId: id, kind: source.kind, text: text)
            variantId = nil
            message = nil

            return nil
        } catch {
            return KnowledgeManageError.message(for: error, action: "save this item")
        }
    }

    func loadContext() async {
        guard !isBusy, variantId == nil else { return }

        guard let variants = try? await APIClient.knowledgeBitVariants(bitId: itemId),
              let match = matchingVariant(in: variants) else { return }

        variantId = match.id
        context = match.context
    }

    func edit(context newContext: String?, prompt: String, answer newAnswer: String) async -> String? {
        guard !isBusy else { return nil }

        isBusy = true
        defer { isBusy = false }

        do {
            let id = try await currentVariantId()
            variantId = try await APIClient.editQuestionVariant(id: id, context: newContext, prompt: prompt, answer: newAnswer)
            if let newContext { context = newContext.isEmpty ? nil : newContext }

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

    private func matchingVariant(in variants: [KnowledgeBitVariant]) -> KnowledgeBitVariant? {
        variants.first { $0.prompt == question && $0.answer == answer } ?? variants.first
    }

    private func currentVariantId() async throws -> String {
        if let variantId { return variantId }

        let variants = try await APIClient.knowledgeBitVariants(bitId: itemId)

        guard let match = matchingVariant(in: variants) else {
            throw APIError.badStatus(404, "not_found")
        }

        variantId = match.id

        return match.id
    }
}
