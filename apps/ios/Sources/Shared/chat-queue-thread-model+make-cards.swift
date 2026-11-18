import PostAnkiAPI
import SwiftUI

extension ChatQueueThreadModel {
    func makeCards(from selection: String) async {
        guard let message = ChatQueueMakeCardsPrompt.message(for: selection) else { return }

        if isSending || isDeleting {
            errorMessage = "Wait for the tutor to finish."

            return
        }

        if limitReached || budgetPaused || isResolving {
            errorMessage = limitReached ? "Chat limit reached, cannot propose cards." : "Chat is unavailable right now, cannot propose cards."

            return
        }

        errorMessage = nil
        await send(message)
    }

    func approveAll(seq: Int) async {
        guard let line = lines.first(where: { $0.seq == seq }) else { return }

        for index in ChatQueueMakeCardsPrompt.pendingIndexes(in: line.proposals) {
            guard await decide(seq: seq, index: index, decision: .accept) else { return }
        }
    }

    func pendingCount(_ line: ChatQueueLine) -> Int {
        ChatQueueMakeCardsPrompt.pendingIndexes(in: line.proposals).count
    }
}
