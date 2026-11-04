import Foundation

extension APIClient {
    @discardableResult
    public static func sendTriageDecisionToChat(id: String, wasRejected: Bool) async -> Bool {
        do {
            if wasRejected {
                do {
                    try await restoreRejectedCard(id: id)
                } catch {
                    guard RejectedCardRestoreOutcome.outcome(for: error) == .notRejected else { return false }
                }
            }

            _ = try await moveToChatQueue(id: id)

            return true
        } catch {
            return false
        }
    }
}
