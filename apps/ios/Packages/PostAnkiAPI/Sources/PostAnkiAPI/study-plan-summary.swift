import Foundation

public struct StudyPlanSummary: Sendable, Equatable {
    public static let barDays = 14

    public let forecast: StudyForecast
    private let calendar: Calendar
    private let locale: Locale

    public init(_ forecast: StudyForecast, calendar: Calendar = .current, locale: Locale = .current) {
        self.forecast = forecast
        self.calendar = calendar
        self.locale = locale
    }

    private func short(_ date: String) -> String {
        StudyPlanDate.short(date, calendar: calendar, locale: locale)
    }

    private func full(_ date: String) -> String {
        StudyPlanDate.display(date, calendar: calendar, locale: locale)
    }

    private static func plural(_ count: Int, _ noun: String) -> String {
        "\(count) \(noun)\(count == 1 ? "" : "s")"
    }

    public var daysLeftText: String? {
        if forecast.examPassed {
            return "The exam date has passed. Cards are scheduled as Long-term until you set a new date."
        }

        guard forecast.intent == .exam, let left = forecast.daysLeft else { return nil }

        if left == 0 { return "The exam is today" }

        return "\(Self.plural(left, "day")) left to the exam"
    }

    public var dueTodayText: String {
        forecast.reviews.dueToday == 0
            ? "No reviews due today"
            : "\(Self.plural(forecast.reviews.dueToday, "review")) due today"
    }

    public var averageText: String {
        let average = forecast.reviews.averagePerDay
        let rounded = average.rounded() == average ? String(Int(average)) : String(format: "%.1f", average)

        return "About \(rounded) reviews a day over the next \(Self.plural(forecast.reviews.horizonDays, "day"))"
    }

    public var peakText: String? {
        guard forecast.reviews.peakPerDay > 0 else { return nil }

        let when = forecast.reviews.peakOn.map { " on \(short($0))" } ?? ""

        return "Busiest day: \(forecast.reviews.peakPerDay) reviews\(when)"
    }

    public var newRemainingText: String {
        forecast.newCards.remaining == 0
            ? "No new cards waiting"
            : "\(Self.plural(forecast.newCards.remaining, "new card")) still to start"
    }

    public var pausedText: String? {
        guard forecast.newCards.pausedToday else { return nil }

        return "New cards are paused today because \(forecast.newCards.pauseThreshold) or more reviews are waiting. They resume when you catch up."
    }

    public var finishText: String? {
        let cards = forecast.newCards

        guard cards.remaining > 0 else { return nil }

        guard let finishOn = cards.finishOn else { return "No finish date yet because no new cards are planned." }

        let base = "New cards finished around \(full(finishOn))"

        guard let examDate = forecast.examDate, let before = cards.finishesBeforeExam, forecast.intent == .exam else {
            return base
        }

        return before
            ? "\(base), before the exam on \(full(examDate))"
            : "\(base), after the exam on \(full(examDate)). Raise new cards per day to finish in time."
    }

    public var finishesLate: Bool { forecast.newCards.finishesBeforeExam == false && forecast.intent == .exam }

    public var retentionText: String {
        let goal = StudyPlanDraft.percent(forecast.desiredRetention)

        guard let recent = forecast.recentRetention else {
            return "No reviews in the last 30 days yet (goal \(goal)%)"
        }

        return "Recent retention \(StudyPlanDraft.percent(recent))% (goal \(goal)%)"
    }

    public var newPerDayText: String {
        let cards = forecast.newCards

        if cards.pausedToday { return "Paused today" }

        return "\(cards.perDay) a day\(cards.paced ? " (set automatically)" : "")"
    }

    public var bars: [StudyForecast.Day] { Array(forecast.days.prefix(Self.barDays)) }

    public func barLabel(_ day: StudyForecast.Day) -> String {
        "\(short(day.date)): \(Self.plural(day.reviews, "review")), \(day.newCards) new"
    }
}
