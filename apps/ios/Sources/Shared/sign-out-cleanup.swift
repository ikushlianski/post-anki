import Foundation
import PostAnkiAPI

enum SignOutCleanup {
    @MainActor
    static func run(
        gradeQueue: PendingGradeQueue = .shared,
        answerQueue: PendingAnswerQueue = .shared,
        decisionQueue: PendingDecisionQueue = .shared,
        variantCacheDirectory: URL? = nil,
        defaults: UserDefaults = .standard
    ) async {
        await gradeQueue.clearAll()
        await answerQueue.clearAll()
        await decisionQueue.clearAll()
        VariantCache.clearAll(in: variantCacheDirectory)
        LastStudied.clear(defaults: defaults)
        UserDefaultsChatQueueDraftStore(defaults: defaults).clearAll()
        UserDefaultsAddDraftStore(defaults: defaults).clearAll()
        UnsentDraftStore.shared.reset()
        await DueBadge.updater.clear()
    }
}
