import Foundation
import PostAnkiAPI

enum SignOutCleanup {
    @MainActor
    static func run(
        gradeQueue: PendingGradeQueue = .shared,
        answerQueue: PendingAnswerQueue = .shared,
        decisionQueue: PendingDecisionQueue = .shared,
        reviewPackStore: ReviewPackStore = .shared,
        skipQueue: PendingSubjectSkipQueue = .shared,
        variantCacheDirectory: URL? = nil,
        defaults: UserDefaults = .standard
    ) async {
        await gradeQueue.clearAll()
        await answerQueue.clearAll()
        await decisionQueue.clearAll()
        skipQueue.clear()
        ReviewPackSync.shared.signedOut()
        await reviewPackStore.clear()
        VariantCache.clearAll(in: variantCacheDirectory)
        LastStudied.clear(defaults: defaults)
        UserDefaultsChatQueueDraftStore(defaults: defaults).clearAll()
        UserDefaultsAddDraftStore(defaults: defaults).clearAll()
        UnsentDraftStore.shared.reset()
        await DueBadge.updater.clear()
    }
}
