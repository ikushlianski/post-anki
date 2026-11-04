import Observation
import PostAnkiAPI

@Observable
@MainActor
final class CardMaturityModel {
    private(set) var breakdown: CardMaturityBreakdown?
    private(set) var failed = false

    func load() async {
        do {
            breakdown = CardMaturityBreakdown(counts: try await APIClient.knowledgeBrowserSubjectCounts())
            failed = false
        } catch {
            failed = breakdown == nil
        }
    }
}
