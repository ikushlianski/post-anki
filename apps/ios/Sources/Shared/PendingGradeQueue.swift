import Foundation
import PostAnkiAPI

struct PendingGrade: Codable, Sendable, Equatable {
    let variantId: String
    let knowledgeBitId: String
    let grade: ReviewGrade
    let durationMs: Int
    let requestId: String
    let createdAt: Date
    let serverURL: String?
}

enum PendingRemoval: Sendable {
    case removed
    case cancelledInFlight
    case notFound
    case sent(reviewId: String)
    case unconfirmed
}

enum CancelledSendOutcome: Sendable, Equatable {
    case sent(reviewId: String)
    case notSent
    case unconfirmed
}

actor PendingGradeQueue {
    static let shared = PendingGradeQueue()

    private var isFlushing = false
    private var inFlightRequestId: String?
    private var cancelledRequestIds: Set<String> = []
    private var unconfirmedRequestIds: Set<String> = []
    private var sentReviewIds: [String: String] = [:]
    private var outcomeWaiters: [String: [CheckedContinuation<CancelledSendOutcome, Never>]] = [:]

    private let fileURLOverride: URL?

    init(fileURL: URL? = nil) {
        fileURLOverride = fileURL
    }

    private var fileURL: URL? {
        if let fileURLOverride { return fileURLOverride }

        return try? FileManager.default
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("pending-grades.json")
    }

    @discardableResult
    func enqueue(_ input: RecordReviewInput, knowledgeBitId: String) -> Bool {
        guard let requestId = input.requestId else {
            return false
        }

        var grades = load()

        if grades.contains(where: { $0.requestId == requestId }) {
            return true
        }

        grades.append(
            PendingGrade(
                variantId: input.variantId,
                knowledgeBitId: knowledgeBitId,
                grade: input.grade,
                durationMs: input.durationMs ?? 0,
                requestId: requestId,
                createdAt: Date(),
                serverURL: ServerScope.current
            )
        )

        return save(grades)
    }

    func flush() async {
        guard !isFlushing else {
            return
        }

        isFlushing = true
        defer { isFlushing = false }

        for entry in load() where ServerScope.matches(entry.serverURL) {
            guard load().contains(where: { $0.requestId == entry.requestId }) else {
                continue
            }

            inFlightRequestId = entry.requestId
            var outcome = CancelledSendOutcome.notSent
            defer {
                inFlightRequestId = nil

                if cancelledRequestIds.remove(entry.requestId) != nil {
                    if case .sent(let reviewId) = outcome, outcomeWaiters[entry.requestId] == nil {
                        sentReviewIds[entry.requestId] = reviewId
                    }

                    outcomeWaiters.removeValue(forKey: entry.requestId)?.forEach { $0.resume(returning: outcome) }
                }
            }

            do {
                let result = try await APIClient.recordReview(Self.input(for: entry))
                outcome = .sent(reviewId: result.reviewId)
                markSent(entry.requestId, reviewId: result.reviewId)
            } catch {
                guard Self.shouldKeep(error) else {
                    drop(entry.requestId)
                    continue
                }

                guard cancelledRequestIds.contains(entry.requestId) else {
                    return
                }

                do {
                    let result = try await APIClient.recordReview(Self.input(for: entry))
                    outcome = .sent(reviewId: result.reviewId)
                    drop(entry.requestId)
                } catch {
                    if Self.shouldKeep(error) {
                        outcome = .unconfirmed
                        unconfirmedRequestIds.insert(entry.requestId)

                        return
                    }

                    drop(entry.requestId)
                }
            }
        }
    }

    func remove(requestId: String) async -> PendingRemoval {
        if let reviewId = sentReviewIds.removeValue(forKey: requestId) {
            return .sent(reviewId: reviewId)
        }

        guard requestId != inFlightRequestId else {
            cancelledRequestIds.insert(requestId)

            return .cancelledInFlight
        }

        let grades = load()

        guard let entry = grades.first(where: { $0.requestId == requestId }) else {
            return .notFound
        }

        if unconfirmedRequestIds.contains(requestId) {
            return await resolveUnconfirmed(entry)
        }

        return save(grades.filter { $0.requestId != requestId }) ? .removed : .notFound
    }

    func cancelledSendOutcome(requestId: String) async -> CancelledSendOutcome {
        if let reviewId = sentReviewIds.removeValue(forKey: requestId) {
            return .sent(reviewId: reviewId)
        }

        if unconfirmedRequestIds.contains(requestId) {
            return .unconfirmed
        }

        guard inFlightRequestId == requestId else {
            return .notSent
        }

        return await withCheckedContinuation { continuation in
            outcomeWaiters[requestId, default: []].append(continuation)
        }
    }

    func pendingKnowledgeBitIds() -> Set<String> {
        Set(load().filter { ServerScope.matches($0.serverURL) }.map(\.knowledgeBitId))
    }

    func count() -> Int {
        load().filter { ServerScope.matches($0.serverURL) }.count
    }

    nonisolated static func shouldKeep(_ error: Error) -> Bool {
        if error is URLError || error is CancellationError {
            return true
        }

        guard let apiError = error as? APIError else {
            return false
        }

        switch apiError {
        case .unauthorized:
            return true
        case .badStatus(let status, _):
            return status >= 500 || status == 408 || status == 429
        default:
            return false
        }
    }

    private func markSent(_ requestId: String, reviewId: String) {
        if unconfirmedRequestIds.remove(requestId) != nil {
            sentReviewIds[requestId] = reviewId
        }

        drop(requestId)
    }

    private func resolveUnconfirmed(_ entry: PendingGrade) async -> PendingRemoval {
        do {
            let result = try await APIClient.recordReview(Self.input(for: entry))
            unconfirmedRequestIds.remove(entry.requestId)
            drop(entry.requestId)

            return .sent(reviewId: result.reviewId)
        } catch {
            if Self.shouldKeep(error) {
                return .unconfirmed
            }

            unconfirmedRequestIds.remove(entry.requestId)
            drop(entry.requestId)

            return .removed
        }
    }

    private nonisolated static func input(for entry: PendingGrade) -> RecordReviewInput {
        RecordReviewInput(
            variantId: entry.variantId,
            grade: entry.grade,
            durationMs: entry.durationMs,
            requestId: entry.requestId
        )
    }

    private func drop(_ requestId: String) {
        save(load().filter { $0.requestId != requestId })
    }

    private func load() -> [PendingGrade] {
        guard let fileURL, let data = try? Data(contentsOf: fileURL) else {
            return []
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        guard let grades = try? decoder.decode([PendingGrade].self, from: data) else {
            quarantine(fileURL)

            return []
        }

        return grades
    }

    private func quarantine(_ fileURL: URL) {
        let name = "\(fileURL.deletingPathExtension().lastPathComponent).unreadable-\(Int(Date().timeIntervalSince1970)).json"

        try? FileManager.default.moveItem(at: fileURL, to: fileURL.deletingLastPathComponent().appendingPathComponent(name))
    }

    @discardableResult
    private func save(_ grades: [PendingGrade]) -> Bool {
        guard let fileURL else {
            return false
        }

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        guard let data = try? encoder.encode(grades) else {
            return false
        }

        return (try? data.write(to: fileURL, options: .atomic)) != nil
    }
}
