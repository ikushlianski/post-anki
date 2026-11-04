import Foundation

public enum RejectedDateLabel {
    public static func day(
        _ iso: String,
        locale: Locale = .current,
        timeZone: TimeZone = .current
    ) -> String? {
        guard let date = ChatQueueDate.parse(iso) else { return nil }

        var style = Date.FormatStyle(date: .abbreviated, time: .omitted, locale: locale, timeZone: timeZone)

        style.calendar = Calendar(identifier: .gregorian)

        return date.formatted(style)
    }
}
