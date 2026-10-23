import PostAnkiAPI
import SwiftUI

struct TopicChatScreen: View {
    let topic: Topic
    @State private var chat: StudyChatModel

    init(topic: Topic) {
        self.topic = topic
        let topicId = topic.id
        _chat = State(initialValue: StudyChatModel(notFoundMessage: "This topic is no longer in a course.") { message, transcript in
            let result = try await APIClient.askTopicChat(
                topicId: topicId,
                message: message,
                transcript: transcript
            )

            return StudyChatReply(reply: result.reply, matchedCards: [], lookupFailed: false)
        })
    }

    var body: some View {
        VStack(spacing: 0) {
            List {
                if chat.turns.isEmpty {
                    ContentUnavailableView(
                        "Ask about \(topic.title)",
                        systemImage: "text.bubble"
                    )
                }

                ForEach(chat.turns) { turn in
                    ChatMessageRow(entry: turn.entry, assistantLabel: "Tutor")
                }

                if let errorMessage = chat.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }

            Divider()

            ChatComposerBar(
                draft: $chat.draft,
                placeholder: "Ask about this topic…",
                isSending: chat.isSending
            ) {
                Task { await chat.send() }
            }
        }
        .navigationTitle(topic.title)
        .inlineNavigationTitle()
    }
}
