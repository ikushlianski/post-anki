import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class StudySessionRunModel {
    let sessionId: String
    var session: StudySession?
    var push: StudySessionPush?
    var result: TopicProbeResult?
    var draft = ""
    var isBusy = false
    var hasLoaded = false
    var errorMessage: String?
    private var excluded: [String] = []
    private var unrecordedOutcome: Bool?

    init(sessionId: String) {
        self.sessionId = sessionId
    }

    var gapId: String? {
        push?.question?.gapId ?? push?.push?.gap.id
    }

    var startDate: Date? {
        StudySessionDates.parse(session?.startedAt)
    }

    func load() async {
        isBusy = true
        errorMessage = nil

        do {
            session = try await APIClient.studySession(id: sessionId)
            hasLoaded = true

            if session?.status == "in_progress", push == nil {
                try await loadPush()
            }
        } catch {
            errorMessage = StudyToolsError.message(for: error, notFound: "This session was removed.")
        }

        isBusy = false
    }

    func start() async {
        await run {
            self.session = try await APIClient.startStudySession(id: self.sessionId)
            try await self.loadPush()
        }
    }

    func submit(answer: String, selfOutcome: String) async {
        guard !isBusy, let topicId = push?.push?.topicId else { return }

        await run {
            do {
                self.result = try await APIClient.answerTopicProbe(
                    topicId: topicId,
                    gapId: self.gapId,
                    answer: answer,
                    selfOutcome: selfOutcome
                )
            } catch APIError.badStatus(409, "gap_not_open"?) {
                self.skipGap()
                try await self.loadPush()

                return
            }

            self.unrecordedOutcome = self.result?.outcome == "pass"
            try await self.record()
        }
    }

    func retryRecord() async {
        await run { try await self.record() }
    }

    private func record() async throws {
        guard let correct = unrecordedOutcome else { return }

        session = try await APIClient.recordStudySessionAnswer(id: sessionId, correct: correct)
        unrecordedOutcome = nil
    }

    func next() async {
        result = nil
        draft = ""
        skipGap()
        await run { try await self.loadPush() }
    }

    func skip() async {
        skipGap()
        await run { try await self.loadPush() }
    }

    func end(userRequested: Bool) async {
        await run {
            self.session = try await APIClient.endStudySession(id: self.sessionId, userRequestedEnd: userRequested)
        }
    }

    private func skipGap() {
        if let gapId, !excluded.contains(gapId) {
            excluded.append(gapId)
        }
    }

    private func loadPush() async throws {
        push = nil
        push = try await APIClient.studySessionPush(id: sessionId, excludeGapIds: excluded)
    }

    private func run(_ work: @escaping @MainActor () async throws -> Void) async {
        isBusy = true
        errorMessage = nil

        do {
            try await work()
        } catch {
            errorMessage = StudyToolsError.message(for: error, notFound: "This session was removed.")
        }

        isBusy = false
    }
}
