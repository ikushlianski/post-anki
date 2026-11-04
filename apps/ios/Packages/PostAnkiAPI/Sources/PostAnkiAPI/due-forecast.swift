import Foundation
import Observation

public struct DueForecastDay: Decodable, Sendable, Equatable, Identifiable {
    public let date: String
    public let count: Int

    public var id: String { date }

    public init(date: String, count: Int) {
        self.date = date
        self.count = count
    }

    public func day(in timeZone: TimeZone = .current) -> Date? {
        Self.formatter(in: timeZone).date(from: date)
    }

    public func accessibilityLabel(now: Date = Date(), timeZone: TimeZone = .current) -> String {
        "\(dayName(now: now, timeZone: timeZone)), \(count) due"
    }

    private func dayName(now: Date, timeZone: TimeZone) -> String {
        var calendar = Calendar(identifier: .gregorian)

        calendar.timeZone = timeZone

        guard let day = day(in: timeZone) else { return date }

        let offset = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: day).day

        if offset == 0 { return "Today" }

        if offset == 1 { return "Tomorrow" }

        let names = DateFormatter()

        names.dateFormat = "EEEE"
        names.timeZone = timeZone

        return names.string(from: day)
    }

    private static func formatter(in timeZone: TimeZone) -> DateFormatter {
        let formatter = DateFormatter()

        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone

        return formatter
    }
}

public struct DueForecast: Decodable, Sendable, Equatable {
    public let overdue: Int
    public let days: [DueForecastDay]

    public init(overdue: Int, days: [DueForecastDay]) {
        self.overdue = overdue
        self.days = days
    }

    public var upcoming: Int { days.reduce(0) { $0 + $1.count } }

    public var accessibilitySummary: String {
        let range = "\(overdue) due now, \(upcoming) more in the next \(days.count) days."

        return upcoming == 0 ? range + " Nothing else due." : range
    }
}

private struct ForecastResponse: Decodable {
    let forecast: DueForecast
}

extension APIClient {
    static func homeForecastPath(days: Int, tz: String) -> String {
        "/analytics/review-statistics" + encodedQuery([
            URLQueryItem(name: "tz", value: tz),
            URLQueryItem(name: "forecastDays", value: String(days)),
            URLQueryItem(name: "historyDays", value: "30"),
        ])
    }

    public static func homeForecast(days: Int = 7, tz: String = TimeZone.current.identifier) async throws -> DueForecast {
        let response: ForecastResponse = try await request(homeForecastPath(days: days, tz: tz))

        return response.forecast
    }
}

@MainActor
@Observable
public final class DueForecastModel {
    public private(set) var forecast: DueForecast?

    private let fetch: @Sendable () async throws -> DueForecast

    public init(fetch: @escaping @Sendable () async throws -> DueForecast = { try await APIClient.homeForecast() }) {
        self.fetch = fetch
    }

    public func load() async {
        guard let loaded = try? await fetch() else { return }

        forecast = loaded
    }
}
