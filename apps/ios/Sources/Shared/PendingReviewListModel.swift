import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class PendingReviewListModel {
    var sources: [PendingReviewSource] = []
    var attentionNotices: [PendingReviewSource] = []
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?
    var inFlight: Set<String> = []
    var rowMessages: [String: String] = [:]
    var notice: String?
    var bulkInFlight: Set<String> = []
    var sourceMessages: [String: String] = [:]
    var pendingUndo: PendingReviewUndo?
    var keptUndo: PendingReviewKeptUndo?
    var pendingFeedback: PendingRejectFeedback?

    let counts: PendingReviewCountStore
    var removedDuringLoad: Set<String> = []
    @ObservationIgnored var restoredDuringLoad: [PendingReviewRemovedBit] = []
    @ObservationIgnored var undoTask: Task<Void, Never>?

    init(counts: PendingReviewCountStore = .shared) {
        self.counts = counts
    }

    func readyCount(in source: PendingReviewSource) -> Int {
        source.bits.filter { !$0.variants.isEmpty && !inFlight.contains($0.id) }.count
    }

    func decide(_ decision: PendingReviewDecision, bitId: String) async -> PendingReviewDecisionOutcome {
        guard !inFlight.contains(bitId) else { return .kept(message: "") }

        inFlight.insert(bitId)
        rowMessages[bitId] = nil
        notice = nil
        defer { inFlight.remove(bitId) }

        let snapshot = decision == .reject ? snapshot(of: bitId) : nil
        let outcome: PendingReviewDecisionOutcome
        var feedbackId: String?

        do {
            switch decision {
            case .approve: try await APIClient.approveKnowledgeBit(id: bitId)
            case .reject: feedbackId = try await APIClient.rejectKnowledgeBit(id: bitId)
            }

            outcome = .removed
        } catch {
            outcome = decision.outcome(for: error)
        }

        switch outcome {
        case .removed:
            withAnimation { remove(bitId: bitId) }
            counts.adjust(by: -1)

            if let snapshot {
                withAnimation { pendingUndo = PendingReviewUndo(removed: snapshot) }
                scheduleUndoExpiry(after: 8)

                if let feedbackId {
                    pendingFeedback = PendingRejectFeedback(feedbackId: feedbackId, bitBody: snapshot.bit.body)
                }
            }
        case .removedElsewhere:
            withAnimation { remove(bitId: bitId) }
            notice = "That item was already decided elsewhere, so it was removed."
            Task { await counts.refresh() }
        case .kept(let message):
            if !message.isEmpty { rowMessages[bitId] = message }
        }

        return outcome
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        failureKind = nil
        removedDuringLoad = []
        restoredDuringLoad = []
        defer { isLoading = false }

        do {
            let fetched = try await APIClient.listPendingReviewWithAttention()
            let removed = removedDuringLoad

            attentionNotices = fetched.filter { $0.attention != nil }

            sources = fetched.compactMap { source in
                let bits = source.bits.filter { !removed.contains($0.id) }

                return bits.isEmpty ? nil : source.withBits(bits)
            }

            for restored in restoredDuringLoad { insert(restored) }

            hasLoaded = true
            rowMessages = [:]
            sourceMessages = [:]
            notice = nil
            Task { await counts.refresh() }
        } catch is CancellationError {
            return
        } catch let error as URLError where error.code == .cancelled {
            return
        } catch {
            errorMessage = Self.message(for: error)
            failureKind = ProgressLoadError.from(error) ?? .other
        }
    }

    func discardNote(sourceId: String) async -> Bool {
        do {
            try await APIClient.discardKnowledgeSource(id: sourceId)
        } catch {
            return false
        }

        attentionNotices.removeAll { $0.id == sourceId }
        Task { await counts.refresh() }

        return true
    }

    func snapshot(of bitId: String) -> PendingReviewRemovedBit? {
        for source in sources {
            if let index = source.bits.firstIndex(where: { $0.id == bitId }) {
                return PendingReviewRemovedBit(
                    sourceId: source.id,
                    sourceText: source.sourceText,
                    subjectName: source.subjectName,
                    index: index,
                    bit: source.bits[index]
                )
            }
        }

        return nil
    }

    func insert(_ removed: PendingReviewRemovedBit) {
        guard !sources.contains(where: { $0.bits.contains { $0.id == removed.bit.id } }) else { return }

        if let position = sources.firstIndex(where: { $0.id == removed.sourceId }) {
            var bits = sources[position].bits

            bits.insert(removed.bit, at: min(removed.index, bits.count))
            sources[position] = sources[position].withBits(bits)
        } else {
            let source = PendingReviewSource(
                knowledgeSourceId: removed.sourceId,
                sourceText: removed.sourceText,
                subjectName: removed.subjectName,
                bits: [removed.bit]
            )

            sources.insert(source, at: 0)
        }
    }

    func remove(bitIds: Set<String>) {
        for id in bitIds { remove(bitId: id) }
    }

    func remove(bitId: String) {
        removedDuringLoad.insert(bitId)
        restoredDuringLoad.removeAll { $0.bit.id == bitId }

        sources = sources.compactMap { source in
            let bits = source.bits.filter { $0.id != bitId }

            return bits.isEmpty ? nil : source.withBits(bits)
        }
    }

    private static func message(for error: Error) -> String {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotConnectToHost:
                #if os(macOS)
                return "Couldn't connect to the server. Try again in a moment."
                #else
                return "Couldn't connect to the server. Pull to refresh to try again."
                #endif
            default:
                break
            }
        }

        if case APIError.unauthorized = error {
            return "Your access token was rejected. Check Settings."
        }

        return "Couldn't load pending items."
    }
}
