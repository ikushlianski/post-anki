import PostAnkiAPI
import SwiftUI

struct ChatQueueLine: Identifiable, Equatable {
    let id: String
    let isUser: Bool
    let text: String
    var seq: Int?
    var proposals: [ChatQueueProposal] = []
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
    var isResolving = false
    var budgetPaused = false
    var errorMessage: String?
    var noticeMessage: String?
    var isDeleting = false
    var rejectFeedback: PendingRejectFeedback?
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
    @ObservationIgnored private let counts: ChatQueueCountStore
    @ObservationIgnored private let drafts: ChatQueueDraftStoring

    init(item: ChatQueueItem, counts: ChatQueueCountStore = .shared,
         drafts: ChatQueueDraftStoring = UserDefaultsChatQueueDraftStore()) {
        self.item = item
        self.counts = counts
        self.drafts = drafts
        draft = drafts.load(cardId: item.id)
        turnsLeft = item.turnsLeft
    }

    var limitReached: Bool { capReached || turnsLeft <= 0 }

    var canSend: Bool {
        !limitReached && !budgetPaused && !isResolving && !isDeleting && (!isSending || !followUps.isFull)
            && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var showsStarters: Bool { lines.isEmpty && !isLoading && !limitReached && !budgetPaused }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let thread = try await APIClient.chatQueueThread(id: item.id)

            lines = thread.messages.map {
                ChatQueueLine(id: "m\($0.seq)", isUser: $0.role == .user, text: $0.text, seq: $0.seq, proposals: $0.proposals)
            }
            turnsLeft = thread.turnsLeft
            capReached = thread.capReached
        } catch is CancellationError {
            return
        } catch {
            errorMessage = ChatQueueFailure.failure(for: error).message
        }
    }

    static let makeCardRequest = "Make a card from this chat"

    func makeCard() async { await send(Self.makeCardRequest) }

    func send(_ preset: String? = nil) async {
        let text = (preset ?? draft).trimmingCharacters(in: .whitespacesAndNewlines)

        guard !text.isEmpty, !isResolving, !isDeleting, !limitReached, !budgetPaused else { return }

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
    func deliver(_ text: String, keepDraft: Bool, merges: Bool = false, clientId queuedId: String? = nil) async -> ChatQueueFailure? {
        let clientId = queuedId ?? (retryId?.text == text ? retryId?.id ?? UUID().uuidString : UUID().uuidString)
        let line = ChatQueueLine(id: "u-\(clientId)", isUser: true, text: text)

        retryId = (text, clientId)
        lines.append(line)

        if !keepDraft { draft = "" }

        errorMessage = nil

        do {
            let result = try await sendIdempotently(text, clientId: clientId)

            awaitsRejectExplanation = false
            lines.append(ChatQueueLine(
                id: "a-\(clientId)",
                isUser: false,
                text: result.reply,
                seq: result.replySeq,
                proposals: result.proposals
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

            return failure
        }
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

    func accept() async {
        await resolve {
            try await APIClient.approveKnowledgeBit(id: item.id)
            finish(removing: true)
        }
    }

    func reject() async {
        await resolve {
            let feedbackId = try await APIClient.rejectKnowledgeBit(id: item.id)

            if let feedbackId {
                rejectFeedback = PendingRejectFeedback(feedbackId: feedbackId, bitBody: item.body, reasonCodes: item.rejectReasonCodes)
                drafts.clear(cardId: item.id)
                counts.adjust(by: -1)
            } else {
                finish(removing: true)
            }
        }
    }

    func sendRejectReason(_ reason: String, note: String) async -> String? {
        guard let feedback = rejectFeedback else { return nil }

        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            try await APIClient.setRejectFeedback(
                id: feedback.feedbackId,
                reasonCode: reason,
                note: trimmed.isEmpty ? nil : trimmed
            )
            rejectFeedback = nil
            isFinished = true

            return nil
        } catch {
            return "Couldn't save the reason. Try again or skip."
        }
    }

    func skipRejectReason() {
        rejectFeedback = nil
        isFinished = true
    }

    func snooze(days: Int) async {
        await resolve {
            _ = try await APIClient.snoozeChatQueue(id: item.id, days: days)
            wasSnoozed = true
            finish(removing: false)
            TriageFeedbackPlayer.announce(.snoozed(days: days))
        }
    }

    func clearChat() async {
        await resolve {
            try await APIClient.returnFromChatQueue(id: item.id)
            finish(removing: true)
        }
    }

    func backToTriage() async {
        await resolve {
            try await APIClient.returnFromChatQueue(id: item.id)
            finish(removing: true)
            TriageFeedbackPlayer.announce(.movedToInbox)
        }
    }

    private func resolve(_ action: () async throws -> Void) async {
        guard !isResolving, !isSending else { return }

        isResolving = true
        errorMessage = nil
        defer { isResolving = false }

        do {
            try await action()
        } catch {
            handle(ChatQueueFailure.failure(for: error))
        }
    }

    private func finish(removing: Bool) {
        if removing {
            counts.adjust(by: -1)
            drafts.clear(cardId: item.id)
        }

        isFinished = true
    }
}
