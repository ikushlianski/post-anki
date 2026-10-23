import PostAnkiAPI
import SwiftUI

enum SourceLibraryError {
    static func message(for error: Error) -> String {
        if case APIError.badStatus(400, "not_refetchable") = error {
            return "Only links can be re-fetched."
        }

        return StudyToolsError.message(for: error, notFound: "This source no longer exists.")
    }
}

struct SourceLibraryGroup: Identifiable {
    let title: String
    let sources: [SourceLibraryItem]

    var id: String { title }
}

@Observable
@MainActor
final class SourceLibraryModel {
    var sources: [SourceLibraryItem] = []
    var query = ""
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?
    var busyIds: Set<String> = []
    var rowMessages: [String: String] = [:]

    var groups: [SourceLibraryGroup] {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let matching = text.isEmpty ? sources : sources.filter { matches($0, text) }
        let grouped = Dictionary(grouping: matching, by: \.groupTitle)

        return grouped
            .map { SourceLibraryGroup(title: $0.key, sources: $0.value.sorted { $0.createdAt > $1.createdAt }) }
            .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
    }

    func badge(for source: SourceLibraryItem) -> String {
        switch source.fetchState {
        case "fetched":
            guard let date = source.lastFetchedAt.flatMap(Self.parse) else { return "Fetched" }

            let relative = date.formatted(.relative(presentation: .named))

            return "Fetched \(relative)"
        case "stale_failed":
            return "Fetch failed (\(source.lastFetchOutcome ?? "unknown"))"
        default:
            return "Not fetched"
        }
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        failureKind = nil
        defer { isLoading = false }

        do {
            sources = try await APIClient.librarySources()
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = SourceLibraryError.message(for: error)
            failureKind = ProgressLoadError.from(error) ?? .other
        }
    }

    func refetch(_ source: SourceLibraryItem) async {
        guard !busyIds.contains(source.id) else { return }

        busyIds.insert(source.id)
        rowMessages[source.id] = nil
        defer { busyIds.remove(source.id) }

        do {
            let result = try await APIClient.refetchLibrarySource(id: source.id)

            rowMessages[source.id] = Self.refetchMessage(result)
            await load()
        } catch {
            rowMessages[source.id] = SourceLibraryError.message(for: error)
        }
    }

    func delete(_ source: SourceLibraryItem) async {
        guard !busyIds.contains(source.id) else { return }

        busyIds.insert(source.id)
        defer { busyIds.remove(source.id) }

        do {
            _ = try await APIClient.deleteLibrarySource(id: source.id)
            sources.removeAll { $0.id == source.id }
        } catch APIError.badStatus(404, _) {
            sources.removeAll { $0.id == source.id }
        } catch {
            rowMessages[source.id] = SourceLibraryError.message(for: error)
        }
    }

    private func matches(_ source: SourceLibraryItem, _ text: String) -> Bool {
        [source.title ?? "", source.value, source.curriculumName, source.subjectName]
            .contains { $0.localizedCaseInsensitiveContains(text) }
    }

    private static func refetchMessage(_ result: SourceLibraryRefetchResult) -> String {
        switch result.outcome {
        case "ok": result.fetchedTextUpdated ? "Page updated." : "Page unchanged."
        case "blocked": "This site blocks fetching."
        case "http_error": "The site returned an error."
        default: "Couldn't reach the site."
        }
    }

    private static func parse(_ text: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        return fractional.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
}

@Observable
@MainActor
final class ContentInboxModel {
    var items: [ContentInboxItem] = []
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        failureKind = nil
        defer { isLoading = false }

        do {
            items = try await APIClient.contentInbox()
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = StudyToolsError.message(for: error)
            failureKind = ProgressLoadError.from(error) ?? .other
        }
    }
}
