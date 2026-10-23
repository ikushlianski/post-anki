import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class TopicQuizModel {
    let topicId: String
    var session: QuizSession?
    var currentId: String?
    var selectedMulti: Set<Int> = []
    var lastResult: QuizAnswerResult?
    var isLoading = false
    var isGenerating = false
    var isSubmitting = false
    var isRemoved = false
    var hasLoaded = false
    var errorMessage: String?

    init(topicId: String) {
        self.topicId = topicId
    }

    var current: QuizQuestion? {
        session?.questions.first { $0.id == currentId }
    }

    var isComplete: Bool {
        session != nil && current == nil
    }

    private func firstUnanswered(in session: QuizSession) -> QuizQuestion? {
        session.questions.filter { !$0.isAnswered }.min { $0.order < $1.order }
    }

    func load() async {
        isLoading = true
        errorMessage = nil

        do {
            let fetched = try await APIClient.activeTopicQuiz(topicId: topicId)
            adopt(fetched)
            hasLoaded = true
        } catch {
            handle(error)
        }

        isLoading = false
    }

    private func adopt(_ fetched: QuizSession?) {
        session = fetched

        guard let fetched else {
            currentId = nil
            return
        }

        if let currentId, fetched.questions.contains(where: { $0.id == currentId && !$0.isAnswered }) {
            return
        }

        currentId = firstUnanswered(in: fetched)?.id
        selectedMulti = []
        lastResult = nil
    }

    func generate(regenerate: Bool) async {
        guard !isGenerating else { return }

        isGenerating = true
        errorMessage = nil

        do {
            let created = try await APIClient.prepareTopicQuiz(topicId: topicId, regenerate: regenerate)
            lastResult = nil
            selectedMulti = []
            session = created
            currentId = firstUnanswered(in: created)?.id
            hasLoaded = true
        } catch {
            handle(error)
        }

        isGenerating = false
    }

    func choose(_ index: Int) async {
        guard let question = current, !question.isMulti else { return }

        await submit(question: question, selected: [index])
    }

    func submitMulti() async {
        guard let question = current, question.isMulti, !selectedMulti.isEmpty else { return }

        await submit(question: question, selected: Array(selectedMulti))
    }

    func toggle(_ index: Int) {
        guard lastResult == nil else { return }

        if selectedMulti.contains(index) {
            selectedMulti.remove(index)
        } else {
            selectedMulti.insert(index)
        }
    }

    private func submit(question: QuizQuestion, selected: [Int]) async {
        guard let sessionId = session?.id, !isSubmitting, lastResult == nil else { return }

        isSubmitting = true
        errorMessage = nil

        do {
            let result = try await APIClient.answerQuizQuestion(
                sessionId: sessionId,
                questionId: question.id,
                selected: selected,
                multi: question.isMulti
            )
            apply(result, question: question, selected: selected)
        } catch {
            handle(error)
        }

        isSubmitting = false
    }

    private func apply(_ result: QuizAnswerResult, question: QuizQuestion, selected: [Int]) {
        guard var updated = session, let position = updated.questions.firstIndex(where: { $0.id == question.id }) else {
            return
        }

        var patched = updated.questions[position]
        patched.answeredIndex = selected.first
        patched.answeredIndexes = question.isMulti ? selected.sorted() : nil
        patched.outcome = result.outcome
        patched.correctAnswerIndex = result.correctAnswerIndex
        patched.correctAnswerIndexes = result.correctAnswerIndexes
        patched.optionExplanations = result.optionExplanations
        updated.questions[position] = patched
        updated.correct = result.correct
        updated.answered = result.answered
        updated.total = result.total
        updated.status = result.status
        session = updated
        lastResult = result
    }

    func next() async {
        guard let session else { return }

        lastResult = nil
        selectedMulti = []
        currentId = firstUnanswered(in: session)?.id

        if currentId == nil && session.status == "active" {
            await load()
        }
    }

    private func handle(_ error: Error) {
        if case APIError.badStatus(404, _) = error {
            isRemoved = true
        }

        errorMessage = QuizError.message(for: error)
    }
}
