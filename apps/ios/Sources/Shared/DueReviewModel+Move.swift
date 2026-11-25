import Foundation
import PostAnkiAPI

extension DueReviewModel {
    static let moveOfflineNotice = "Moving a card needs a connection. Try again when you are back online."

    var canReachServer: Bool { !isOffline && ReviewPackSync.shared.isOnline }

    func presentMovePicker() {
        guard !isGrading, let card = current else { return }

        guard canReachServer else {
            notice = Self.moveOfflineNotice

            return
        }

        notice = nil
        moveError = nil
        movePickerCard = card
    }

    func moveCurrent(toSubject subjectId: String, label: String, recents: RecentMoveTargets = RecentMoveTargets()) async -> Bool {
        guard !isGrading, let card = movePickerCard ?? current else { return false }

        guard !movingBitIds.contains(card.knowledgeBitId) else { return false }

        guard canReachServer else {
            moveError = Self.moveOfflineNotice

            return false
        }

        isGrading = true
        defer { isGrading = false }

        moveError = nil
        gradeError = nil
        suspendedUndo = nil
        knownUndo = nil

        guard let advanced = advanceFirst(past: card, buriedVariantIds: []) else {
            return await moveWaitingForServer(card, subjectId: subjectId, label: label, recents: recents)
        }

        movePickerCard = nil
        movingBitIds.insert(card.knowledgeBitId)
        skippedVariantIds.insert(card.variantId)
        notice = "Moved to \(label)"

        runInBackground(bitId: card.knowledgeBitId) { [self] in
            await sendMove(card, advanced: advanced, subjectId: subjectId, label: label, recents: recents)
        }

        return true
    }

    private func sendMove(
        _ card: ReviewCard,
        advanced: AdvanceSnapshot,
        subjectId: String,
        label: String,
        recents: RecentMoveTargets
    ) async {
        defer { movingBitIds.remove(card.knowledgeBitId) }

        do {
            let result = try await APIClient.moveKnowledgeBits(ids: [card.knowledgeBitId], subjectId: subjectId)

            if result.moved.contains(card.knowledgeBitId) {
                recents.record(subjectId)
            } else {
                failMove(card, advanced, message: Self.moveSkipMessage(result.skipped.first?.reason), moved: "Moved to \(label)")
            }
        } catch {
            let message = Self.isCancellation(error) ? nil : KnowledgeManageError.message(for: error, action: "move this card")

            failMove(card, advanced, message: message, moved: "Moved to \(label)")
        }
    }

    private func moveWaitingForServer(_ card: ReviewCard, subjectId: String, label: String, recents: RecentMoveTargets) async -> Bool {
        do {
            let result = try await APIClient.moveKnowledgeBits(ids: [card.knowledgeBitId], subjectId: subjectId)

            guard result.moved.contains(card.knowledgeBitId) else {
                moveError = Self.moveSkipMessage(result.skipped.first?.reason)

                return false
            }

            recents.record(subjectId)
            movePickerCard = nil
            removeFromQueue(afterGrading: card, buriedVariantIds: [])
            await showNext()
            notice = "Moved to \(label)"

            return true
        } catch {
            if !Self.isCancellation(error) {
                moveError = KnowledgeManageError.message(for: error, action: "move this card")
            }

            return false
        }
    }

    private func failMove(_ card: ReviewCard, _ advanced: AdvanceSnapshot, message: String?, moved: String) {
        reinsert(advanced)

        if notice == moved { notice = nil }

        guard let message else { return }

        if current?.variantId == card.variantId {
            movePickerCard = card
            moveError = message
        } else {
            notice = message
        }
    }

    static func moveSkipMessage(_ reason: String?) -> String {
        switch reason {
        case "curriculum_placed": "This card is part of a course, so it stays in the course subject."
        case "not_approved": "This card is not approved yet, so it cannot be moved."
        default: "Couldn't move this card. Try again."
        }
    }
}
