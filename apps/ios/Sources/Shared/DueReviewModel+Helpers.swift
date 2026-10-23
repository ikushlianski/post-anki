import Foundation
import PostAnkiAPI

extension DueReviewModel {
    nonisolated static func newRequestId() -> String {
        UUID().uuidString.lowercased()
    }

    nonisolated static func durationMs(elapsed: Duration) -> Int {
        let parts = elapsed.components
        let ms = parts.seconds * 1000 + parts.attoseconds / 1_000_000_000_000_000

        return Int(min(max(ms, 0), 86_400_000))
    }

    nonisolated static func nextDueText(_ iso: String, now: Date = Date()) -> String? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]

        guard let date = withFraction.date(from: iso) ?? plain.date(from: iso) else {
            return nil
        }

        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full

        return formatter.localizedString(for: date, relativeTo: now)
    }

    nonisolated static func displayPrompt(_ card: ReviewCard) -> String {
        guard card.kind == "fill_in_the_blank" else { return card.prompt }

        return card.prompt.replacingOccurrences(of: "____", with: "[...]")
    }
}
