import Foundation
import PostAnkiAPI

enum NotionSourceText {
    static let removeToggleTitle = "Remove imported items from Notion"
    static let removeHelper = "Imported items are deleted from Notion. Off keeps the page unchanged. Items are only removed after a successful import, and blocks with nested content are never removed."
    static let removeFootnote = "When on, imported lines are deleted from your Notion page."
    static let emptyTitle = "No Notion sources yet"
    static let emptyMessage = "Add a source, then press Ingest Now on its row."
    static let deleteMessage = "Cards already imported are kept, and nothing changes in Notion."
    static let secretKeyMissing = "Saving a token needs an encryption key on the server. Set CONNECTOR_SECRET_KEY in the server environment, restart the API, then try again."

    static func summary(_ result: NotionRunResult) -> String {
        ([mainSummary(result)] + runNotes(result)).joined(separator: " ")
    }

    static func runNotes(_ result: NotionRunResult) -> [String] {
        var notes: [String] = []

        if result.truncated { notes.append("Page was cut off at 500 blocks, so later phrases were not read.") }

        if result.pendingAfterLimit > 0 { notes.append("\(result.pendingAfterLimit) more waiting.") }

        return notes
    }

    static func failureReason(_ code: String?) -> String? {
        guard let code else { return nil }

        switch code {
        case "budget_check_unavailable": return "The AI spending limit could not be checked."
        case "run_finish_failed": return "The run finished but its result could not be saved."
        case "notion_unauthorized", "notion_restricted_resource":
            return "Notion refused access. Check the token and that the page is shared with the integration."
        case "notion_object_not_found": return "Notion could not find the page. Check the link and that it is shared."
        case "notion_rate_limited": return "Notion is limiting requests. Try again later."
        default: return code.hasPrefix("notion_") ? "Notion returned an error." : "Something went wrong while running."
        }
    }

    static func lastRunFailure(_ run: NotionLastRun?) -> String? {
        guard let run, run.status == .failed else { return nil }

        return failureReason(run.errorCode)
    }

    static func connectionFailure(_ reason: String?) -> String {
        switch reason {
        case "not_connected": "No Notion token is set. Add one first."
        case "unreachable": "Notion could not be reached. Try again later."
        default: "Notion did not accept the token. Check it and that the integration is added to your pages."
        }
    }

    static func safeHttpURL(_ text: String) -> URL? {
        guard let url = URL(string: text), let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return nil }

        return url
    }

    private static func mainSummary(_ result: NotionRunResult) -> String {
        switch result.status {
        case .ok, .running, .unknown:
            return "Done: \(counts(result))."
        case .partial:
            return "Partly done: \(counts(result)). \(result.removeFailed) could not be removed and stay on the page; blocks with nested content are never removed."
        case .failed:
            return "The run failed. Try again later."
        case .skippedBudget:
            return "Skipped: today's AI spending limit is used up. Nothing was imported."
        case .skippedNoConnection:
            return "Skipped: Notion is not connected. Add a token in Admin settings."
        }
    }

    private static func counts(_ result: NotionRunResult) -> String {
        var parts = ["imported \(result.imported)"]

        if result.skippedExisting > 0 { parts.append("skipped \(result.skippedExisting) already imported") }

        if result.ignored > 0 { parts.append("ignored \(result.ignored) that are not phrases") }

        parts.append("removed \(result.removed) from Notion")

        return parts.joined(separator: ", ")
    }

    static func lastRun(_ run: NotionLastRun?) -> String {
        guard let run else { return "Never run" }

        let when = run.finishedAt.flatMap(parse).map { ", \(whenText($0))" } ?? ""
        let status = statusLabel(run.status)

        return "Last run: \(status)\(when), imported \(run.imported), removed \(run.removed)"
    }

    static func whenText(_ date: Date) -> String {
        let locale = Locale(identifier: "en_US")
        let day = date.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted).locale(locale))
        let time = date.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(locale))

        return "\(day), \(time)".replacingOccurrences(of: "\u{202F}", with: " ")
    }

    static func nextRun(_ source: NotionIngestionSource, now: Date = Date()) -> String? {
        guard !source.paused, let text = source.nextRunAt, let date = parse(text) else { return nil }

        let minutes = Int((date.timeIntervalSince(now) / 60).rounded())

        if minutes <= 0 { return "Next run due now" }

        if minutes < 60 { return "Next run in \(plural(minutes, "minute"))" }

        if minutes < 60 * 24 { return "Next run in \(plural(Int((Double(minutes) / 60).rounded()), "hour"))" }

        return "Next run in \(plural(Int((Double(minutes) / 1440).rounded()), "day"))"
    }

    private static func plural(_ count: Int, _ unit: String) -> String {
        "\(count) \(unit)\(count == 1 ? "" : "s")"
    }

    static func statusLabel(_ status: NotionRunStatus) -> String {
        switch status {
        case .running: "Running"
        case .ok: "Done"
        case .partial: "Partly done"
        case .failed: "Failed"
        case .skippedBudget: "Skipped, AI limit used up"
        case .skippedNoConnection: "Skipped, Notion not connected"
        case .unknown: "Unknown"
        }
    }

    static func saveError(_ error: Error) -> String {
        if case APIError.badStatus(_, let code?) = error {
            switch code {
            case "page_already_added": return "This Notion page is already added as a source."
            case "subject_not_found": return "That subject no longer exists. Pick another one."
            case "invalid_input": return "Some fields are not valid. Check the link and the numbers."
            default: break
            }
        }

        return "Could not save the source. Try again."
    }

    static func runError(_ error: Error) -> String {
        if case APIError.badStatus(_, let code?) = error {
            if code == "already_running" { return "A run for this source is already in progress. Try again in a few minutes." }

            if code == "not_found" { return "This source no longer exists." }
        }

        return "The run could not be completed. Try again."
    }

    private static func parse(_ text: String) -> Date? {
        let withFraction = ISO8601DateFormatter()

        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        return withFraction.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
}
