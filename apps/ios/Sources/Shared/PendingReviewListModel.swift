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

    let counts: PendingReviewCountStore
    var removedDuringLoad: Set<String> = []
    @ObservationIgnored var restoredDuringLoad: [PendingReviewRemovedBit] = []
    @ObservationIgnored var undoTask: Task<Void, Never>?
    @ObservationIgnored var topUpTask: Task<Void, Never>?
    @ObservationIgnored var windowGeneration = 0
    @ObservationIgnored var windowExhausted = true
    @ObservationIgnored var windowScope: String?
    @ObservationIgnored var windowCursor: PendingReviewCursor?
    var serverUnloaded: (subjectId: String?, count: Int)?
    @ObservationIgnored let windowed: Bool
    @ObservationIgnored var scopeSubjectId: String?
    @ObservationIgnored var loadTask: Task<Void, Never>?
    @ObservationIgnored var reloadRequested = false

    init(counts: PendingReviewCountStore = .shared, windowed: Bool = false) {
        self.counts = counts
        self.windowed = windowed
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

        do {
            switch decision {
            case .approve: try await APIClient.approveKnowledgeBit(id: bitId)
            case .reject: _ = try await APIClient.rejectKnowledgeBit(id: bitId)
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

    func load(limit requestedLimit: Int? = nil, subjectId requestedSubjectId: String? = nil) async {
        if let loadTask {
            reloadRequested = true
            await loadTask.value

            return
        }

        isLoading = true

        let task = Task { await loadCoalescingReloads(limit: requestedLimit, subjectId: requestedSubjectId) }
        loadTask = task

        await withTaskCancellationHandler {
            await task.value
        } onCancel: {
            task.cancel()
        }
    }

    private func loadCoalescingReloads(limit: Int?, subjectId: String?) async {
        defer {
            isLoading = false
            loadTask = nil
        }

        repeat {
            reloadRequested = false
            await fetchWindow(limit: limit, subjectId: subjectId)
        } while reloadRequested && !Task.isCancelled
    }

    private func fetchWindow(limit requestedLimit: Int?, subjectId requestedSubjectId: String?) async {
        let limit = requestedLimit ?? (windowed ? PendingReviewWindow.target : nil)
        let subjectId = requestedSubjectId ?? (windowed ? scopeSubjectId : nil)

        errorMessage = nil
        failureKind = nil
        removedDuringLoad = []
        restoredDuringLoad = []
        resetWindow(exhausted: true, scope: nil)

        do {
            let page = try await APIClient.listPendingReviewPage(limit: limit, subjectId: subjectId, attention: true)
            let fetched = page.sources
            let removed = removedDuringLoad

            recordServerTotal(page.total, loaded: fetched, subjectId: subjectId)
            windowCursor = PendingReviewWindow.cursor(after: nil, loaded: fetched)

            if let limit {
                windowExhausted = PendingReviewWindow.bitCount(fetched) < limit
                windowScope = subjectId
            }

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
                    bit: source.bits[index],
                    rejectReasonCodes: source.rejectReasonCodes
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
                bits: [removed.bit],
                rejectReasonCodes: removed.rejectReasonCodes
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
