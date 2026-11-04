import Foundation

public enum RejectedSearchQuery {
    public static let maxChars = 200
    public static let debounce: Duration = .milliseconds(300)

    public static func normalize(_ raw: String?) -> String? {
        guard let raw else { return nil }

        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmed.isEmpty else { return nil }

        return String(trimmed.prefix(maxChars))
    }

    public static func emptyTitle(query: String?, reason: RejectedCardReason?, hasSubject: Bool = false) -> String {
        if let term = normalize(query) { return "No rejected cards match \"\(term)\"" }

        if hasSubject { return "No rejected cards in this subject" }

        return reason == nil ? "No rejected cards yet" : "No rejected cards with this reason"
    }
}

@MainActor
public final class RejectedSearchDebouncer {
    private let sleep: @Sendable () async throws -> Void
    private let commit: @MainActor (String?) -> Void
    private var task: Task<Void, Never>?
    private var committed: String?

    public init(
        sleep: @escaping @Sendable () async throws -> Void = { try await Task.sleep(for: RejectedSearchQuery.debounce) },
        commit: @escaping @MainActor (String?) -> Void
    ) {
        self.sleep = sleep
        self.commit = commit
    }

    public func input(_ draft: String) {
        task?.cancel()

        let next = RejectedSearchQuery.normalize(draft)

        guard next != committed else {
            task = nil

            return
        }

        task = Task { [sleep] in
            do { try await sleep() } catch { return }

            guard !Task.isCancelled else { return }

            committed = next
            commit(next)
        }
    }

    public func cancel() {
        task?.cancel()
        task = nil
    }
}
