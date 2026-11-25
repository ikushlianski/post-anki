import PostAnkiAPI
import SwiftUI

struct ChatQueueLine: Identifiable, Equatable {
    let id: String
    let isUser: Bool
    let text: String
    var seq: Int?
    var proposals: [ChatQueueProposal] = []
    var modelId: String?
}

struct ChatQueueProposalKey: Hashable {
    let seq: Int
    let index: Int
}

@Observable
@MainActor
final class ChatQueueThreadModel {
    var item: ChatQueueItem
    var lines: [ChatQueueLine] = []
    var draft = "" {
        didSet { if draft != oldValue { drafts.save(draft, cardId: item.id) } }
    }
    var turnsLeft: Int
    var capReached = false
    var isLoading = false
    var isSending = false
    var awaitsFirstReply = false
    var isResolving = false
    var budgetPaused = false
    var errorMessage: String?
    var noticeMessage: String?
    var isDeleting = false
    var rejectFeedback: PendingRejectFeedback?
    var rejectFeedbackId: String?
    var isFinished = false
    var wasSnoozed = false
    var decidingProposals: Set<ChatQueueProposalKey> = []
    var rewordingProposals: Set<ChatQueueProposalKey> = []
    var proposalErrors: [ChatQueueProposalKey: String] = [:]
    var awaitsRejectExplanation = false
    var composerFocusRequests = 0
    var followUps = ChatQueueFollowUpQueue()

    @ObservationIgnored var rejectAnnouncement: Task<Void, Never>?
    @ObservationIgnored var rejectMessageIds: Set<String> = []
    @ObservationIgnored private var retryId: (text: String, id: String)?
    @ObservationIgnored var inFlightRetryDelay: Duration = .seconds(1)
    @ObservationIgnored var firstReplyPollDelay: Duration = .seconds(3)
    @ObservationIgnored let counts: ChatQueueCountStore
    @ObservationIgnored let drafts: ChatQueueDraftStoring
    @ObservationIgnored let tracksQueue: Bool
    @ObservationIgnored var writeTail: Task<Void, Never>?
    @ObservationIgnored var onRolledBack: (@MainActor (String, String) -> Void)?

    init(item: ChatQueueItem, counts: ChatQueueCountStore = .shared,
         drafts: ChatQueueDraftStoring = UserDefaultsChatQueueDraftStore(), tracksQueue: Bool = true) {
        self.item = item
        self.tracksQueue = tracksQueue
        self.counts = counts
        self.drafts = drafts
        draft = drafts.load(cardId: item.id)
        turnsLeft = item.turnsLeft
    }

    var hasAcceptedCard: Bool {
        lines.contains { $0.proposals.contains { $0.status == .accepted } }
    }

    var limitReached: Bool { capReached || turnsLeft <= 0 }

    var canSend: Bool {
        !limitReached && !budgetPaused && !awaitsFirstReply && !isResolving && !isDeleting && !isFinished && (!isSending || !followUps.isFull)
            && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var showsStarters: Bool { lines.isEmpty && !isLoading && !limitReached && !budgetPaused }

    func load() async {
        guard let prompt = await fetchThread() else { return }

        await awaitFirstReply(prompt)
    }

    private func fetchThread() async -> String? {
        guard !isLoading, !awaitsFirstReply else { return nil }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let thread = try await APIClient.chatQueueThread(id: item.id)

            apply(thread)

            return thread.messages.isEmpty ? thread.pendingPrompt : nil
        } catch is CancellationError {
            return nil
        } catch {
            errorMessage = ChatQueueFailure.failure(for: error).message

            return nil
        }
    }

    func apply(_ thread: ChatQueueThread) {
        lines = thread.messages.map {
            ChatQueueLine(id: "m\($0.seq)", isUser: $0.role == .user, text: $0.text, seq: $0.seq, proposals: $0.proposals, modelId: $0.modelId)
        }
        turnsLeft = thread.turnsLeft
        capReached = thread.capReached
    }

    static let makeCardRequest = "Make a card from this chat"

    func makeCard() async { await send(Self.makeCardRequest) }

    func send(_ preset: String? = nil) async {
        let text = (preset ?? draft).trimmingCharacters(in: .whitespacesAndNewlines)

        guard !text.isEmpty, !isResolving, !isDeleting, !isFinished, !limitReached, !budgetPaused else { return }

        if isSending {
            guard preset == nil, followUps.enqueue(text) != nil else { return }

            draft = ""

            return
        }

        isSending = true
        defer { isSending = false }

        let failure = await deliver(text, keepDraft: preset != nil)

        if failure != nil { appendFollowUpsToDraft() } else { await drainFollowUps() }
    }

    var canRetryLast: Bool {
        retryableQuestion != nil && !isSending && !isResolving && !isDeleting && !isLoading && !budgetPaused
    }

    func isRetryable(_ line: ChatQueueLine) -> Bool {
        canRetryLast && lines.last?.id == line.id
    }

    private var retryableQuestion: String? {
        guard lines.count >= 2, let last = lines.last, !last.isUser else { return nil }

        let question = lines[lines.count - 2]

        return question.isUser ? question.text : nil
    }

    func retryLast() async {
        guard canRetryLast, let question = retryableQuestion else { return }

        isSending = true
        isDeleting = true
        errorMessage = nil
        noticeMessage = nil
        defer { isSending = false }

        do {
            let result = try await APIClient.deleteLastChatQueueExchange(id: item.id)

            lines.removeLast(2)

            if let turns = result.turnsLeft { turnsLeft = turns }

            capReached = result.capReached
            retryId = nil
            isDeleting = false
        } catch {
            isDeleting = false

            let failure = ChatQueueFailure.failure(for: error)

            switch failure {
            case .inFlight:
                noticeMessage = failure.deleteLastMessage
            case .notInChat, .notFound:
                handle(failure)
            default:
                errorMessage = failure.deleteLastMessage
            }

            return
        }

        let failure = await deliver(question, keepDraft: true, merges: true)

        if failure != nil { appendFollowUpsToDraft() } else { await drainFollowUps() }
    }

    @discardableResult
    func deliver(
        _ text: String,
        keepDraft: Bool,
        merges: Bool = false,
        clientId queuedId: String? = nil,
        after gate: Task<Bool, Never>? = nil
    ) async -> ChatQueueFailure? {
        let clientId = queuedId ?? (retryId?.text == text ? retryId?.id ?? UUID().uuidString : UUID().uuidString)
        let line = ChatQueueLine(id: "u-\(clientId)", isUser: true, text: text)

        retryId = (text, clientId)
        lines.append(line)

        if !keepDraft { draft = "" }

        errorMessage = nil

        if let gate, await !gate.value {
            lines.removeAll { $0.id == line.id }
            retryId = nil

            return .other
        }

        do {
            let result = try await sendIdempotently(text, clientId: clientId)

            awaitsRejectExplanation = false
            lines.append(ChatQueueLine(
                id: "a-\(clientId)",
                isUser: false,
                text: result.reply,
                seq: result.replySeq,
                proposals: result.proposals,
                modelId: result.modelId
            ))
            turnsLeft = result.turnsLeft
            capReached = result.capReached
            retryId = nil

            return nil
        } catch {
            lines.removeAll { $0.id == line.id }

            if merges {
                draft = ChatQueueRetryDraft.restoring(question: text, over: draft)
            } else if !keepDraft {
                draft = text
            }

            let failure = ChatQueueFailure.failure(for: error)

            handle(failure)

            if failure == .invalidModel { await recoverFromStaleModel() }

            return failure
        }
    }

    private func recoverFromStaleModel() async {
        ChatModelCatalog.shared.reset()
        await ChatModelCatalog.shared.refresh()
        errorMessage = nil
        noticeMessage = ChatQueueFailure.invalidModel.message
    }

    private func sendIdempotently(_ text: String, clientId: String) async throws -> ChatQueueReply {
        do {
            return try await APIClient.sendChatQueueMessage(id: item.id, clientMessageId: clientId, message: text)
        } catch {
            guard ChatQueueFailure.failure(for: error) == .inFlight else { throw error }

            try await Task.sleep(for: inFlightRetryDelay)

            return try await APIClient.sendChatQueueMessage(id: item.id, clientMessageId: clientId, message: text)
        }
    }

    var canDeleteLast: Bool { !lines.isEmpty && !isSending && !isResolving && !isDeleting && !isLoading }

    func deleteLastExchange() async {
        guard canDeleteLast else { return }

        isDeleting = true
        errorMessage = nil
        noticeMessage = nil
        defer { isDeleting = false }

        do {
            let result = try await APIClient.deleteLastChatQueueExchange(id: item.id)

            awaitsRejectExplanation = false
            await load()

            if let turns = result.turnsLeft { turnsLeft = turns }

            capReached = result.capReached
        } catch {
            let failure = ChatQueueFailure.failure(for: error)

            switch failure {
            case .inFlight:
                noticeMessage = failure.deleteLastMessage
            case .notInChat, .notFound:
                handle(failure)
            default:
                errorMessage = failure.deleteLastMessage
            }
        }
    }

    func handle(_ failure: ChatQueueFailure) {
        switch failure {
        case .capReached:
            capReached = true
            turnsLeft = 0
        case .budgetPaused:
            budgetPaused = true
        case .notInChat, .notFound:
            finish(removing: true)
        default:
            break
        }

        errorMessage = failure.message
    }
}
