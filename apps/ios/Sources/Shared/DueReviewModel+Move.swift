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

        let advanced = advanceFirst(past: card, buriedVariantIds: [])

        if advanced != nil { movePickerCard = nil }

        do {
            let result = try await APIClient.moveKnowledgeBits(ids: [card.knowledgeBitId], subjectId: subjectId)

            guard result.moved.contains(card.knowledgeBitId) else {
                failMove(card, advanced, message: Self.moveSkipMessage(result.skipped.first?.reason))

                return false
            }

            recents.record(subjectId)
            movePickerCard = nil

            if advanced == nil {
                removeFromQueue(afterGrading: card, buriedVariantIds: [])
                await showNext()
            }

            notice = "Moved to \(label)"

            return true
        } catch is CancellationError {
            failMove(card, advanced, message: nil)

            return false
        } catch let error as URLError where error.code == .cancelled {
            failMove(card, advanced, message: nil)

            return false
        } catch {
            failMove(card, advanced, message: KnowledgeManageError.message(for: error, action: "move this card"))

            return false
        }
    }

    private func failMove(_ card: ReviewCard, _ advanced: AdvanceSnapshot?, message: String?) {
        if let advanced {
            rollBack(advanced)
            movePickerCard = card
        }

        if let message { moveError = message }
    }

    static func moveSkipMessage(_ reason: String?) -> String {
        switch reason {
        case "curriculum_placed": "This card is part of a course, so it stays in the course subject."
        case "not_approved": "This card is not approved yet, so it cannot be moved."
        default: "Couldn't move this card. Try again."
        }
    }
}
