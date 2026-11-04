import Foundation

public struct LearningDailyStat: Decodable, Sendable, Equatable, Identifiable {
    public let date: String
    public let reviews: Int
    public let newCards: Int

    public var id: String { date }

    public init(date: String, reviews: Int, newCards: Int) {
        self.date = date
        self.reviews = reviews
        self.newCards = newCards
    }

    public var day: Date? { Self.formatter.date(from: date) }

    private static var formatter: DateFormatter {
        let formatter = DateFormatter()

        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")

        return formatter
    }
}

public struct LearningStats: Decodable, Sendable, Equatable {
    public let daily: [LearningDailyStat]

    public static let windowDays = 30

    public var totalReviews: Int { daily.reduce(0) { $0 + $1.reviews } }

    public var isEmpty: Bool { totalReviews == 0 && daily.allSatisfy { $0.newCards == 0 } }

    public static let emptyText = "No reviews in the last 30 days"

    public var accessibilitySummary: String {
        guard !isEmpty else { return Self.emptyText }

        let average = Double(totalReviews) / Double(max(daily.count, 1))
        let busiest = daily.max { $0.reviews < $1.reviews }
        let busiestText = busiest.map { ". Busiest day \($0.date) with \($0.reviews) reviews" } ?? ""

        return "Reviews per day, last \(daily.count) days. \(totalReviews) reviews in total, \(String(format: "%.1f", average)) per day on average\(busiestText)"
    }
}
