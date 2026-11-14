import Foundation
import PostAnkiAPI

extension DueReviewModel {
    func suspendCurrent(offersUndo: Bool = false) async {
        await applyControl(suspended: true, buried: nil, done: "Card suspended", offersUndo: offersUndo)
    }

    func undoSuspend() async {
        guard !isGrading, let card = suspendedUndo else { return }

        isGrading = true
        defer { isGrading = false }

        suspendedUndo = nil
        notice = nil

        do {
            _ = try await APIClient.setSchedule(
                id: card.knowledgeBitId,
                suspended: false,
                buried: nil,
                variantId: card.variantId
            )

            queue.removeAll { $0.variantId == card.variantId }

            if let shown = current, shown.variantId != card.variantId {
                queue.insert(shown, at: 0)
            }

            present(card)
        } catch is CancellationError {
            return
        } catch let error as URLError where error.code == .cancelled {
            return
        } catch {
            notice = KnowledgeManageError.message(for: error, action: "unsuspend this card")
        }
    }

    func buryCurrent() async {
        await applyControl(suspended: nil, buried: true, done: "Card buried until tomorrow")
    }

    private func applyControl(suspended: Bool?, buried: Bool?, done: String, offersUndo: Bool = false) async {
        guard !isGrading, let card = current else { return }

        isGrading = true
        defer { isGrading = false }

        gradeError = nil
        notice = nil
        suspendedUndo = nil

        do {
            _ = try await APIClient.setSchedule(
                id: card.knowledgeBitId,
                suspended: suspended,
                buried: buried,
                variantId: card.variantId
            )

            removeFromQueue(afterGrading: card, buriedVariantIds: card.isIndependentCard ? [] : nil)
            await showNext()

            if offersUndo {
                suspendedUndo = card
            } else {
                notice = done
            }
        } catch is CancellationError {
            return
        } catch let error as URLError where error.code == .cancelled {
            return
        } catch {
            if KnowledgeManageError.isGone(error) {
                skippedVariantIds.insert(card.variantId)
                await showNext()
                notice = "That card is no longer available"
            } else {
                notice = KnowledgeManageError.message(for: error, action: "update this card")
            }
        }
    }
}
