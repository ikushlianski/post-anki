import PostAnkiAPI
import SwiftUI

enum DailyPushError {
    static func message(for error: Error) -> String {
        StudyToolsError.message(for: error, notFound: "This topic was removed.")
    }
}

@Observable
@MainActor
final class DailyPushModel {
    var push: DailyPushPick?
    var question: DailyPushQuestion?
    var queue: [DailyPushPick] = []
    var answer = ""
    var result: TopicProbeResult?
    var isLoading = false
    var isSubmitting = false
    var hasLoaded = false
    var errorMessage: String?
    var openMessage: String?
    var failureKind: ProgressLoadError?
    var openedTopic: Topic?

    var canSubmit: Bool {
        result == nil && !isSubmitting && !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var visibleQueue: [DailyPushPick] {
        queue.filter { $0.gap.id != push?.gap.id }
    }

    func load(keepResult: Bool = false) async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        failureKind = nil
        defer { isLoading = false }

        do {
            async let daily = APIClient.dailyPush()
            async let due = APIClient.dueQueue()
            let fetchedDaily = try await daily
            let fetchedDue = try await due

            if !keepResult || result == nil {
                push = fetchedDaily.push
                question = fetchedDaily.question
                answer = ""
                result = nil
            }

            queue = fetchedDue.items
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = DailyPushError.message(for: error)
            failureKind = ProgressLoadError.from(error)
        }
    }

    func submit() async {
        guard canSubmit, let push else { return }

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            result = try await APIClient.answerTopicProbe(
                topicId: push.topicId,
                gapId: question?.gapId ?? push.gap.id,
                answer: answer.trimmingCharacters(in: .whitespacesAndNewlines),
                selfOutcome: nil
            )
        } catch {
            errorMessage = DailyPushError.message(for: error)

            if case APIError.badStatus(404, _) = error {
                await load()
            }
        }
    }

    func open(_ pick: DailyPushPick) async {
        openMessage = nil

        guard let detail = try? await APIClient.getCurriculumDetail(pick.curriculumId),
              let topic = detail.modules.flatMap(\.topics).first(where: { $0.id == pick.topicId })
        else {
            openMessage = "Couldn't open this topic."

            return
        }

        openedTopic = topic
    }
}

@Observable
@MainActor
final class DailyPushCardModel {
    var push: DailyPushPick?
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            push = try await APIClient.dailyPush().push
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = DailyPushError.message(for: error)
        }
    }
}
