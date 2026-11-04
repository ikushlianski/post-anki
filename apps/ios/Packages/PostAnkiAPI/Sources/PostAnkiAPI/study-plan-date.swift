import Foundation

public enum StudyPlanDate {
    public static func parse(_ value: String, calendar: Calendar = .current) -> Date? {
        let parts = value.split(separator: "-").compactMap { Int($0) }

        guard parts.count == 3 else { return nil }

        let components = DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12)

        return calendar.date(from: components)
    }

    public static func string(from date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)

        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    public static func display(_ value: String, calendar: Calendar = .current, locale: Locale = .current) -> String {
        guard let date = parse(value, calendar: calendar) else { return value }

        let formatter = DateFormatter()

        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.locale = locale
        formatter.setLocalizedDateFormatFromTemplate("d MMM yyyy")

        return formatter.string(from: date)
    }

    public static func short(_ value: String, calendar: Calendar = .current, locale: Locale = .current) -> String {
        guard let date = parse(value, calendar: calendar) else { return value }

        let formatter = DateFormatter()

        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.locale = locale
        formatter.setLocalizedDateFormatFromTemplate("d MMM")

        return formatter.string(from: date)
    }
}
