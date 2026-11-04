import PostAnkiAPI
import SwiftUI

enum FocusTriageChatSend: Equatable {
    case sending
    case sent
    case failed
}

extension FocusTriageSessionModel {
    func sendToChat(_ row: FocusTriageDecisionRow) async {
        guard row.kind == .rejected || row.kind == .inbox, chatSends[row.bitId] != .sending, chatSends[row.bitId] != .sent else { return }

        chatSends[row.bitId] = .sending

        let sent = await APIClient.sendTriageDecisionToChat(id: row.bitId, wasRejected: row.kind == .rejected)

        chatSends[row.bitId] = sent ? .sent : .failed

        if sent {
            ChatQueueCountStore.shared.adjust(by: 1)
            TriageFeedbackPlayer.announce(.sentToChat)
        }
    }
}
