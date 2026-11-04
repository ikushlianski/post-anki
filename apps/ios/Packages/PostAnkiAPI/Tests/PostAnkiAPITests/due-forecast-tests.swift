import Foundation
import Testing
@testable import PostAnkiAPI

@MainActor
@Suite("Due forecast")
struct DueForecastTests {
    private let sample = DueForecast(overdue: 3, days: (1...7).map { DueForecastDay(date: "2026-11-0\($0)", count: $0) })

    @Test("should request seven forecast days with the time zone")
    func path() {
        let path = APIClient.homeForecastPath(days: 7, tz: "UTC")

        #expect(path.hasPrefix("/analytics/review-statistics?"))
        #expect(path.contains("forecastDays=7"))
        #expect(path.contains("tz=UTC"))
    }

    @Test("should decode the forecast from the review statistics response")
    func decodes() throws {
        let json = #"{"forecast":{"overdue":2,"days":[{"date":"2026-11-01","count":4}]},"retention":{}}"#
        let response = try JSONDecoder().decode([String: DueForecast].self, from: Data(json.utf8).withoutExtraKeys())

        #expect(response["forecast"]?.overdue == 2)
        #expect(response["forecast"]?.days.first?.day() != nil)
    }

    @Test("should summarise overdue and upcoming cards for VoiceOver")
    func summary() {
        #expect(sample.upcoming == 28)
        #expect(sample.accessibilitySummary == "3 due now, 28 more in the next 7 days.")
        #expect(DueForecast(overdue: 0, days: []).accessibilitySummary == "0 due now, 0 more in the next 0 days. Nothing else due.")
    }

    @Test("should label each bar with the day name and its due count in the device time zone")
    func barLabels() throws {
        let zone = try #require(TimeZone(identifier: "America/Los_Angeles"))
        let now = try #require(ISO8601DateFormatter().date(from: "2026-11-01T03:00:00Z"))
        let today = DueForecastDay(date: "2026-10-31", count: 5)
        let tomorrow = DueForecastDay(date: "2026-11-01", count: 12)
        let later = DueForecastDay(date: "2026-11-04", count: 1)

        #expect(today.accessibilityLabel(now: now, timeZone: zone) == "Today, 5 due")
        #expect(tomorrow.accessibilityLabel(now: now, timeZone: zone) == "Tomorrow, 12 due")
        #expect(later.accessibilityLabel(now: now, timeZone: zone) == "Wednesday, 1 due")
    }

    @Test("should place a forecast day at midnight of the same calendar date in the device time zone")
    func binning() throws {
        let zone = try #require(TimeZone(identifier: "America/Los_Angeles"))
        var calendar = Calendar(identifier: .gregorian)

        calendar.timeZone = zone

        let day = try #require(DueForecastDay(date: "2026-11-01", count: 1).day(in: zone))
        let parts = calendar.dateComponents([.year, .month, .day, .hour], from: day)

        #expect(parts.day == 1 && parts.month == 11 && parts.hour == 0)
    }

    @Test("should show the forecast once loaded")
    func loads() async {
        let model = DueForecastModel(fetch: { DueForecast(overdue: 1, days: []) })

        await model.load()

        #expect(model.forecast?.overdue == 1)
    }

    @Test("should stay silent and keep the last forecast when the request fails")
    func silentFailure() async {
        let failing = DueForecastModel(fetch: { throw URLError(.notConnectedToInternet) })

        await failing.load()

        #expect(failing.forecast == nil)
    }
}

private extension Data {
    func withoutExtraKeys() -> Data {
        guard let object = try? JSONSerialization.jsonObject(with: self) as? [String: Any],
              let forecast = object["forecast"],
              let data = try? JSONSerialization.data(withJSONObject: ["forecast": forecast]) else { return self }

        return data
    }
}
