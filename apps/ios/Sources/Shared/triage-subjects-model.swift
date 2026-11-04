import Observation
import PostAnkiAPI

@Observable
@MainActor
final class TriageSubjectsModel {
    private(set) var rows: [PendingReviewSubjectCount] = []
    private(set) var hasLoaded = false
    private(set) var errorMessage: String?
    @ObservationIgnored private var isLoading = false

    var totalPending: Int { rows.reduce(0) { $0 + $1.pendingCount } }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        defer { isLoading = false }

        do {
            rows = try await APIClient.pendingReviewSubjects()
            errorMessage = nil
            hasLoaded = true
        } catch is CancellationError {
            return
        } catch {
            errorMessage = "Couldn't load subjects (\(LoadFailureReason.describe(error)))."
        }
    }
}

enum TriageSubjectsText {
    static func pending(_ count: Int) -> String { "\(count) pending" }

    static func triageAll(_ count: Int) -> String { count > 0 ? "Triage all (\(count))" : "Triage all" }
}
