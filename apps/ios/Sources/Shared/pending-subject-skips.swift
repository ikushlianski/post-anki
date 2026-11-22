import Foundation
import PostAnkiAPI

struct PendingSubjectSkips: Codable, Equatable {
    var serverURL: String
    var dayKey: String
    var skipped: [String: Bool]
}

final class PendingSubjectSkipQueue: @unchecked Sendable {
    static let shared = PendingSubjectSkipQueue()

    private let defaults: UserDefaults
    private let key = "pendingSubjectSkips"
    private let lock = NSLock()

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func record(_ subjectIds: [String], skipped: Bool, dayKey: String) {
        lock.withLock {
            var pending = current(dayKey: dayKey)

            for id in subjectIds { pending.skipped[id] = skipped }

            save(pending)
        }
    }

    func entries(dayKey: String) -> [String: Bool] {
        lock.withLock { current(dayKey: dayKey).skipped }
    }

    var isEmpty: Bool {
        lock.withLock { load() == nil }
    }

    func clear() {
        lock.withLock { defaults.removeObject(forKey: key) }
    }

    func flush(timeZone: String = TimeZone.current.identifier, dayKey: String = LocalDayKey.today()) async {
        let entries = lock.withLock { current(dayKey: dayKey).skipped }

        for (id, skipped) in entries.sorted(by: { $0.key < $1.key }) {
            do {
                if skipped {
                    _ = try await APIClient.skipSubjectForDay(id, tz: timeZone)
                } else {
                    _ = try await APIClient.unskipSubjectForDay(id, tz: timeZone)
                }
            } catch {
                return
            }

            lock.withLock { remove(id, expected: skipped) }
        }

        lock.withLock { if current(dayKey: dayKey).skipped.isEmpty { defaults.removeObject(forKey: key) } }
    }

    private func remove(_ id: String, expected: Bool) {
        guard var pending = load(), pending.skipped[id] == expected else { return }

        pending.skipped[id] = nil
        save(pending)
    }

    private func current(dayKey: String) -> PendingSubjectSkips {
        if let stored = load(), stored.serverURL == ServerScope.current, stored.dayKey == dayKey { return stored }

        return PendingSubjectSkips(serverURL: ServerScope.current, dayKey: dayKey, skipped: [:])
    }

    private func load() -> PendingSubjectSkips? {
        defaults.data(forKey: key).flatMap { try? JSONDecoder().decode(PendingSubjectSkips.self, from: $0) }
    }

    private func save(_ pending: PendingSubjectSkips) {
        defaults.set(try? JSONEncoder().encode(pending), forKey: key)
    }
}
