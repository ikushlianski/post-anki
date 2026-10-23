import PostAnkiAPI
import SwiftUI

extension CourseBuildModel {
    func approveSources(override: Bool = false) async {
        if await perform({ try await APIClient.courseBuildApproveSources(id: courseId, override: override) }) {
            allowOverride = false
        } else if case APIError.badStatus(_, "no_approved_sources")? = lastError {
            allowOverride = true
        }
    }

    func removeSource(_ source: CourseBuildSource) async {
        _ = await perform { try await APIClient.courseBuildDeleteSource(id: source.id) }
    }

    func addLink(_ link: String) async -> Bool {
        await perform { try await APIClient.courseBuildAddLinks(id: courseId, links: [link]) }
    }

    func sendTurn(_ message: String) async -> Bool {
        await perform { try await APIClient.courseBuildSendTurn(id: courseId, message: message) }
    }

    func useSelectedCandidates() async {
        let ids = Array(selectedCandidates)

        if await perform({ try await APIClient.courseBuildResolveCandidates(id: courseId, approvedIds: ids) }) {
            selectedCandidates = []
        }
    }

    func skipCandidates() async {
        _ = await perform { try await APIClient.courseBuildResolveCandidates(id: courseId, approvedIds: []) }
        selectedCandidates = []
    }

    func confirmStructure() async {
        _ = await perform { try await APIClient.courseBuildConfirmStructure(id: courseId) }
    }

    func setIncluded(_ topic: CourseBuildTopic, included: Bool) async {
        _ = await perform { try await APIClient.courseBuildSetIncluded(topicId: topic.id, included: included) }
    }

    func includeAll() async {
        let excluded = (detail?.modules ?? []).flatMap(\.topics).filter { !$0.included }

        _ = await perform {
            for topic in excluded {
                try await APIClient.courseBuildSetIncluded(topicId: topic.id, included: true)
            }
        }
    }

    func confirmCourse() async {
        _ = await perform { try await APIClient.courseBuildConfirm(id: courseId) }
    }

    func retry() async {
        let action = retryAction

        _ = await perform { try await APIClient.courseBuildRetry(id: courseId, action: action) }
    }

    private func perform(_ work: () async throws -> Void) async -> Bool {
        guard !isWorking else { return false }

        isWorking = true
        errorMessage = nil
        lastError = nil
        defer { isWorking = false }

        do {
            try await work()
            await load(silent: true)
            kickPolling()

            return true
        } catch {
            lastError = error
            errorMessage = CourseBuildError.message(for: error)

            if case APIError.badStatus(409, "turn_in_progress") = error {
                errorMessage = nil
                await load(silent: true)
                kickPolling()
            }

            return false
        }
    }
}
