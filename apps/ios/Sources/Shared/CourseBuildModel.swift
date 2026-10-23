import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class CourseBuildModel {
    let courseId: String
    var detail: CourseBuildDetail?
    var turns: [CourseBuildTurn] = []
    var isLoading = false
    var isWorking = false
    var hasLoaded = false
    var stalled = false
    var errorMessage: String?
    var allowOverride = false
    var lastError: Error?
    var selectedCandidates: Set<String> = []
    private var pollTask: Task<Void, Never>?

    init(courseId: String) {
        self.courseId = courseId
    }

    var status: String { detail?.curriculum.status ?? "" }

    var lastAssistantTurn: CourseBuildTurn? {
        turns.last { $0.role == "assistant" }
    }

    var latestSnapshot: CourseBuildSnapshot? {
        turns.last { $0.structureSnapshot != nil }?.structureSnapshot
    }

    var pendingCandidates: [CourseBuildCandidate] {
        lastAssistantTurn?.pendingResearchCandidates.filter { $0.approvalStatus == "pending" } ?? []
    }

    var turnPending: Bool { lastAssistantTurn?.status == "pending" }

    var needsPolling: Bool {
        switch status {
        case "draft", "curating": true
        case "shaping_structure": turnPending
        default: false
        }
    }

    var retryAction: String {
        guard let detail else { return "retry-research" }

        if detail.curriculum.origin == "sources" { return "reparse" }

        return detail.hasStructureDraftAttempt ? "retry-structure-draft" : "retry-research"
    }

    func load(silent: Bool = false) async {
        guard !isLoading else { return }

        isLoading = true
        defer { isLoading = false }

        if !silent { errorMessage = nil }

        do {
            let fetched = try await APIClient.courseBuildDetail(id: courseId)

            detail = fetched

            if fetched.curriculum.status == "shaping_structure" {
                turns = try await APIClient.courseBuildTurns(id: courseId)
            }

            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            if !silent { errorMessage = CourseBuildError.message(for: error) }
        }
    }

    func kickPolling() {
        guard pollTask == nil, needsPolling else { return }

        stalled = false
        pollTask = Task { [weak self] in
            let deadline = Date().addingTimeInterval(600)

            while let self, !Task.isCancelled, self.needsPolling {
                if Date() > deadline {
                    self.stalled = true

                    break
                }

                let seconds: UInt64 = self.status == "shaping_structure" ? 3 : 4

                try? await Task.sleep(nanoseconds: seconds * 1_000_000_000)

                if Task.isCancelled { break }

                await self.load(silent: true)
            }

            self?.pollTask = nil
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    func reload() async {
        await load()
        kickPolling()
    }
}
