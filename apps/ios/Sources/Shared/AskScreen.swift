import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class AskOptions {
    var allowGeneralKnowledge = false
}

struct AskScreen: View {
    @State private var options: AskOptions
    @State private var chat: StudyChatModel
    @State private var draftClipped = false

    private let drafts: UnsentDraftStore?
    private let draftKey = UnsentDraftStore.key("ask")

    init(drafts: UnsentDraftStore? = nil) {
        self.drafts = drafts

        let options = AskOptions()
        _options = State(initialValue: options)

        let chat = StudyChatModel { message, transcript in
            let result = try await APIClient.askAllCards(
                message: message,
                transcript: transcript,
                allowGeneralKnowledge: options.allowGeneralKnowledge
            )

            return StudyChatReply(
                reply: result.reply,
                matchedCards: result.matchedCards,
                lookupFailed: result.lookupFailed
            )
        }
        chat.draft = drafts?.text(for: UnsentDraftStore.key("ask")) ?? ""
        _chat = State(initialValue: chat)
    }

    var body: some View {
        VStack(spacing: 0) {
            List {
                Section {
                    Text("Answers come from your saved cards.")
                        .zoomFont(.subheadline)
                        .foregroundStyle(.secondary)
                    Toggle("Also use general knowledge", isOn: $options.allowGeneralKnowledge)
                }

                if chat.turns.isEmpty {
                    ContentUnavailableView(
                        "Ask anything",
                        systemImage: "text.bubble",
                        description: Text("Questions are answered from all your cards.")
                    )
                }

                ForEach(chat.turns) { turn in
                    AskTurnRow(turn: turn)
                }

                if let errorMessage = chat.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }

            Divider()

            ChatComposerBar(
                draft: $chat.draft,
                placeholder: "Ask your cards…",
                isSending: chat.isSending
            ) {
                Task { await chat.send() }
            }

            if draftClipped {
                DraftClippedNote().zoomPadding(.bottom, 6)
            }
        }
        .navigationTitle("Ask")
        .onChange(of: chat.draft) {
            drafts?.set(chat.draft, for: draftKey)
            draftClipped = drafts?.wasClipped(for: draftKey) ?? false
        }
        .reportsUnsentInput("ask", chat.hasInput)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Clear") { chat.clear() }
                    .disabled(chat.turns.isEmpty)
            }
        }
    }
}

private struct AskTurnRow: View {
    let turn: StudyChatTurn
    @State private var showsAllCards = false

    private var visibleCards: [MatchedCard] {
        showsAllCards ? turn.matchedCards : Array(turn.matchedCards.prefix(3))
    }

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 6) {
            ChatMessageRow(entry: turn.entry, assistantLabel: "Answer")

            if turn.lookupFailed {
                Text("Couldn't search your cards; this answer is general.")
                    .zoomFont(.caption)
                    .foregroundStyle(.orange)
            }

            ForEach(visibleCards) { card in
                Text("From: \(card.prompt) (\(card.topicTitle))")
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
            }

            if turn.matchedCards.count > 3 {
                Button(showsAllCards ? "Show fewer" : "Show \(turn.matchedCards.count - 3) more") {
                    showsAllCards.toggle()
                }
                .zoomFont(.caption)
                .buttonStyle(.borderless)
            }
        }
    }
}
