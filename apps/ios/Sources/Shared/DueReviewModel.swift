import Foundation
import Observation
import PostAnkiAPI

struct GradedCard: Sendable {
    let card: ReviewCard
    let grade: ReviewGrade
    let reviewId: String?
    let requestId: String
}

@MainActor
@Observable
final class DueReviewModel {
    enum LoadState: Equatable {
        case loading
        case card
        case empty
        case error(String)
        case unauthorized
    }

    var state: LoadState = .loading
    var current: ReviewCard?
    var chatCard: ReviewCard?
    var isRevealed = false
    var isGrading = false
    var gradeError: String?
    var failedGrade: ReviewGrade?
    var notice: String?
    var nextDueAt: String?
    var dailyLimit: DailyReviewLimit?
    var noCardsYet = false
    var reviewedCount = 0
    var lastGraded: GradedCard?
    var pendingCount = 0
    var isOffline = false
    var serverCounts: ReviewRemainingCounts?
    var saveFailure: SaveFailure?
    var unsentCards: [String: ReviewCard] = [:]
    var followUpEligible: Set<String> = []
    var gradedNewCount = 0
    var gradedOtherCount = 0
    var dailyGoal: DailyGoalProgress?
    var goalStreak: GoalStreak?
    let dailyGoalRefresher = DailyGoalRefresher.live()

    var remainingCounts: ReviewRemainingCounts? {
        serverCounts?.lowered(gradedNew: gradedNewCount, gradedOther: gradedOtherCount)
    }

    var aheadLabel: String? { LearnAheadOption.label(days: aheadDays) }

    var isErrorState: Bool {
        if case .error = state { return true }

        return false
    }

    static let unconfirmedNotice = "Couldn't confirm the grade; try undo again when online"

    var queue: [ReviewCard] = []
    var shownAt = ContinuousClock.now
    var cardRequestId = DueReviewModel.newRequestId()
    var skippedVariantIds: Set<String> = []
    var easyGradedVariantIds: Set<String> = []
    var settledVariantIds: Set<String> = []
    var settledBitIds: Set<String> = []
    var hasLoaded = false
    let gradeQueue: PendingGradeQueue
    let scope: DueReviewScope?
    var aheadDays: Int
    let retryDelay: Duration?
    var windowGeneration = 0
    var windowExhausted = false
    var topUpTask: Task<Void, Never>?
    var sendTask: Task<Void, Never>?
    var sendAgain = false
    var retryTask: Task<Void, Never>?

    init(
        gradeQueue: PendingGradeQueue = .shared,
        scope: DueReviewScope? = nil,
        aheadDays: Int = 0,
        retryDelay: Duration? = .seconds(20)
    ) {
        self.gradeQueue = gradeQueue
        self.scope = scope
        self.aheadDays = LearnAheadOption.clamped(aheadDays)
        self.retryDelay = retryDelay

        Task { [weak self] in
            for await _ in NotificationCenter.default.notifications(named: .pendingQueuesFlushed) {
                guard let self else { return }

                await self.refreshAfterBackgroundFlush()
            }
        }
    }

    func reveal() {
        guard current != nil, !isRevealed else { return }

        isRevealed = true
    }

    func showNext() async {
        guard !queue.isEmpty else {
            current = nil
            await load()
            return
        }

        present(queue.removeFirst())
    }

    func present(_ card: ReviewCard) {
        current = card
        isRevealed = false
        gradeError = nil
        shownAt = ContinuousClock.now
        cardRequestId = Self.newRequestId()
        state = .card
        dailyLimit = nil
        topUpIfNeeded()
    }
}
