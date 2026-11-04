import Foundation
import PostAnkiAPI

struct DailyReviewLimit: Equatable, Sendable {
    static let aheadChoices = [1, 2, 3, 5]

    let reviewed: Int?
    let limit: Int?

    init?(_ response: ReviewCardsResponse, aheadDays: Int) {
        guard response.limitReached == true, response.cards.isEmpty, aheadDays == 0 else { return nil }

        reviewed = response.reviewedToday
        limit = response.limit
    }

    var message: String {
        guard let reviewed, let limit, limit > 0 else { return "You reached your daily review limit." }

        return "You reviewed \(reviewed) of \(limit) cards today."
    }

    static func aheadTitle(_ days: Int) -> String { days == 1 ? "1 day" : "\(days) days" }
}

extension DueReviewModel {
    func reviewAhead(days: Int) async {
        aheadDays = LearnAheadOption.clamped(days)
        dailyLimit = nil
        await load()
    }
}
