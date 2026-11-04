import Foundation
import PostAnkiAPI

extension DueReviewModel {
    func suspendCurrent() async {
        await applyControl(suspended: true, buried: nil, done: "Card suspended")
    }

    func buryCurrent() async {
        await applyControl(suspended: nil, buried: true, done: "Card buried until tomorrow")
    }

    private func applyControl(suspended: Bool?, buried: Bool?, done: String) async {
        guard !isGrading, let card = current else { return }

        isGrading = true
        defer { isGrading = false }

        gradeError = nil
        notice = nil

        do {
            _ = try await APIClient.setSchedule(
                id: card.knowledgeBitId,
                suspended: suspended,
                buried: buried,
                variantId: card.variantId
            )

            removeFromQueue(afterGrading: card, buriedVariantIds: card.isIndependentCard ? [] : nil)
            await showNext()
            notice = done
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
