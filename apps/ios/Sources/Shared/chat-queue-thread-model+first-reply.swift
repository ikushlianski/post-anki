import PostAnkiAPI
import SwiftUI

extension ChatQueueThreadModel {
    static let firstReplyMaxPolls = 20

    func awaitFirstReply(_ prompt: String) async {
        awaitsFirstReply = true
        lines = [ChatQueueLine(id: "pending-prompt", isUser: true, text: prompt)]
        defer { awaitsFirstReply = false }

        for _ in 0..<Self.firstReplyMaxPolls {
            do {
                try await Task.sleep(for: firstReplyPollDelay)
            } catch {
                lines = []

                return
            }

            guard let thread = try? await APIClient.chatQueueThread(id: item.id) else { continue }

            if !thread.messages.isEmpty {
                apply(thread)

                return
            }

            if thread.pendingPrompt == nil { break }
        }

        lines = []

        if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { draft = prompt }

        noticeMessage = "The first reply didn't arrive. Your question is back in the box, send it when ready."
    }
}
