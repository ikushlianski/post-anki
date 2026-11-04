import Foundation
import PostAnkiAPI

struct PendingDecision: Codable, Sendable, Equatable {
    enum Kind: Codable, Sendable, Equatable {
        case approve
        case reject
        case keep([String])
    }

    let id: String
    let bitId: String
    let kind: Kind
    let note: String?
    let title: String?
    let serverURL: String?
}

struct SettledDecision: Sendable, Equatable {
    enum Result: Sendable, Equatable {
        case sent(feedbackId: String?, dropped: [String])
        case stale
    }

    let entry: PendingDecision
    let result: Result
    var noteFailed = false
}

enum PendingDecisionRemoval: Sendable, Equatable {
    case removed
    case inFlight
    case notFound
}

actor PendingDecisionQueue {
    static let shared = PendingDecisionQueue()

    private static let settledLimit = 100

    private let fileURLOverride: URL?
    private let retryDelay: Duration
    private var isFlushing = false
    private var inFlightId: String?
    private var settled: [SettledDecision] = []
    private(set) var failure: SaveFailure?

    init(fileURL: URL? = nil, retryDelay: Duration = .seconds(1)) {
        fileURLOverride = fileURL
        self.retryDelay = retryDelay
    }

    private var fileURL: URL? {
        if let fileURLOverride { return fileURLOverride }

        return try? FileManager.default
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("pending-triage-decisions.json")
    }

    func enqueue(bitId: String, kind: PendingDecision.Kind, note: String? = nil, title: String? = nil) -> String? {
        var entries = load()

        guard !entries.contains(where: { $0.bitId == bitId }) else { return nil }

        let id = UUID().uuidString.lowercased()

        entries.append(
            PendingDecision(id: id, bitId: bitId, kind: kind, note: note, title: title, serverURL: ServerScope.current)
        )

        return save(entries) ? id : nil
    }

    func flush() async {
        guard !isFlushing, failure == nil else { return }

        isFlushing = true
        defer { isFlushing = false }

        for entry in load() where ServerScope.matches(entry.serverURL) {
            guard load().contains(where: { $0.id == entry.id }) else { continue }

            inFlightId = entry.id
            defer { inFlightId = nil }

            do {
                let sent = try await BackgroundSaveOutcome.send(retryDelay: retryDelay) { try await Self.perform(entry) }

                drop(entry.id)
                inFlightId = nil
                await record(entry, sent: sent)
            } catch {
                switch BackgroundSaveOutcome.classify(error) {
                case .stale:
                    drop(entry.id)
                    append(SettledDecision(entry: entry, result: .stale))
                case .failed(let message):
                    failure = SaveFailure(id: entry.id, bitId: entry.bitId, title: entry.title, message: message)

                    return
                default:
                    return
                }
            }
        }
    }

    func remove(id: String) -> PendingDecisionRemoval {
        guard id != inFlightId else { return .inFlight }

        let entries = load()

        guard entries.contains(where: { $0.id == id }) else { return .notFound }

        if failure?.id == id { failure = nil }

        return save(entries.filter { $0.id != id }) ? .removed : .notFound
    }

    func pendingIds() -> [String: String] {
        var ids: [String: String] = [:]

        for entry in load() where ServerScope.matches(entry.serverURL) && entry.id != failure?.id {
            ids[entry.bitId] = entry.id
        }

        return ids
    }

    func takeSettled() -> [SettledDecision] {
        defer { settled = [] }

        return settled
    }

    func retryFailed() {
        failure = nil
    }

    @discardableResult
    func skipFailed() -> PendingDecision? {
        guard let failed = failure else { return nil }

        let entry = load().first { $0.id == failed.id }

        drop(failed.id)
        failure = nil

        return entry
    }

    func count() -> Int {
        load().filter { ServerScope.matches($0.serverURL) }.count
    }

    func clearAll() {
        if let url = fileURL { try? FileManager.default.removeItem(at: url) }

        settled = []
        failure = nil
    }

    private func record(_ entry: PendingDecision, sent: (feedbackId: String?, dropped: [String])) async {
        let noteFailed = await Self.sendNote(for: entry, feedbackId: sent.feedbackId)

        append(SettledDecision(
            entry: entry,
            result: .sent(feedbackId: sent.feedbackId, dropped: sent.dropped),
            noteFailed: noteFailed
        ))
    }

    private func append(_ item: SettledDecision) {
        settled.append(item)

        if settled.count > Self.settledLimit { settled.removeFirst(settled.count - Self.settledLimit) }
    }

    private nonisolated static func perform(_ entry: PendingDecision) async throws -> (feedbackId: String?, dropped: [String]) {
        switch entry.kind {
        case .approve:
            try await APIClient.approveKnowledgeBit(id: entry.bitId)

            return (nil, [])
        case .reject:
            return (try await APIClient.rejectKnowledgeBit(id: entry.bitId), [])
        case .keep(let variantIds):
            return (nil, try await APIClient.triageKnowledgeBit(id: entry.bitId, keepVariantIds: variantIds))
        }
    }

    private nonisolated static func sendNote(for entry: PendingDecision, feedbackId: String?) async -> Bool {
        guard let note = entry.note else { return false }

        do {
            switch entry.kind {
            case .approve:
                _ = try await APIClient.gradeKnowledgeBit(id: entry.bitId, rating: 3, note: note)
            case .reject:
                guard let feedbackId else { throw APIError.badStatus(404, nil) }

                try await APIClient.updateKnowledgeBitFeedbackNote(id: feedbackId, note: note)
            case .keep:
                _ = try await APIClient.gradeKnowledgeBit(id: entry.bitId, rating: 3, note: note)
            }

            return false
        } catch is CancellationError {
            return false
        } catch {
            return true
        }
    }

    private func drop(_ id: String) {
        save(load().filter { $0.id != id })
    }

    private func load() -> [PendingDecision] {
        guard let fileURL, let data = try? Data(contentsOf: fileURL) else { return [] }

        guard let entries = try? JSONDecoder().decode([PendingDecision].self, from: data) else {
            quarantine(fileURL)

            return []
        }

        return entries
    }

    private func quarantine(_ fileURL: URL) {
        let name = "\(fileURL.deletingPathExtension().lastPathComponent).unreadable-\(Int(Date().timeIntervalSince1970)).json"

        try? FileManager.default.moveItem(at: fileURL, to: fileURL.deletingLastPathComponent().appendingPathComponent(name))
    }

    @discardableResult
    private func save(_ entries: [PendingDecision]) -> Bool {
        guard let fileURL, let data = try? JSONEncoder().encode(entries) else { return false }

        return (try? data.write(to: fileURL, options: .atomic)) != nil
    }
}
