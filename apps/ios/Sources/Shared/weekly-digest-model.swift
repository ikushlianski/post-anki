import Observation
import PostAnkiAPI

@Observable
@MainActor
final class WeeklyDigestModel {
    enum Phase: Equatable {
        case loading
        case loaded(WeeklyDigestSummary)
        case failed
    }

    private(set) var phase: Phase = .loading

    func load() async {
        if phase == .failed { phase = .loading }

        do {
            phase = .loaded(try await APIClient.weeklyDigestSummary())
        } catch {
            phase = .failed
        }
    }
}
