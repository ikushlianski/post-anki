import PostAnkiAPI
import SwiftUI

struct TriageInboxScreen: View {
    @State private var model = TriageInboxModel()
    @State private var discarding: InboxKnowledgeBit?
    @State private var editing: InboxKnowledgeBit?
    @State private var chatting: InboxKnowledgeBit?
    @State private var debouncer: RejectedSearchDebouncer?

    var body: some View {
        content
            .navigationTitle("Inbox")
            .searchable(text: $model.draft, prompt: "Search Inbox")
            .onChange(of: model.draft) { _, draft in debouncer?.input(draft) }
            .navigationDestination(item: $chatting) { item in
                KnowledgeItemChatScreen(knowledgeBitId: item.id, bitBody: item.body)
            }
            .task {
                debouncer = RejectedSearchDebouncer { [model] term in model.query = term }
                await model.load()
            }
            .onDisappear { debouncer?.cancel() }
            .refreshable { await model.load() }
            .sheet(item: $editing) { item in
                if let note = item.note {
                    NoteEditSheet(
                        kind: note.kind,
                        text: note.text,
                        onSave: { text in await model.saveNote(item, text: text) },
                        onClose: { editing = nil }
                    )
                    .macSheetMinSize(width: 480, height: 460)
                }
            }
            .confirmationDialog(
                "Discard this item?",
                isPresented: Binding(get: { discarding != nil }, set: { if !$0 { discarding = nil } }),
                titleVisibility: .visible
            ) {
                Button("Discard", role: .destructive) {
                    if let id = discarding?.id { Task { await model.discard(id) } }

                    discarding = nil
                }
                Button("Cancel", role: .cancel) { discarding = nil }
            } message: {
                Text("It is rejected and leaves the Inbox. No feedback is recorded.")
            }
            .confirmationDialog(
                "Replace your example?",
                isPresented: Binding(get: { model.overwritePromptId != nil }, set: { if !$0 { model.overwritePromptId = nil } }),
                titleVisibility: .visible
            ) {
                Button("Replace with AI example", role: .destructive) {
                    if let id = model.overwritePromptId { Task { await model.newExample(id, overwrite: true) } }
                }
                Button("Keep mine", role: .cancel) { model.overwritePromptId = nil }
            } message: {
                Text("This item has an example you wrote.")
            }
    }

    @ViewBuilder
    private var content: some View {
        if !model.hasLoaded, model.errorMessage == nil {
            ProgressView()
        } else if model.items.isEmpty || model.visibleItems.isEmpty {
            ContentUnavailableView {
                Label(model.errorMessage == nil ? InboxSearch.emptyTitle(query: model.items.isEmpty ? nil : model.query) : "Couldn't load", systemImage: model.errorMessage == nil ? (model.items.isEmpty ? "tray" : "magnifyingglass") : "exclamationmark.triangle")
            } description: {
                Text(model.errorMessage ?? (model.items.isEmpty ? "While triaging, swipe a card down or tap Inbox to park the item here. You can ask the tutor about it from here." : "Try a different word or subject."))
            } actions: {
                if model.errorMessage != nil { Button("Try again") { Task { await model.load() } } }
            }
        } else {
            List {
                if let message = model.errorMessage {
                    Text(message)
                        .zoomFont(.caption)
                        .foregroundStyle(.red)
                }

                if let truncation = model.truncation {
                    Text(truncation.message)
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("inbox-truncated-notice")
                }

                ForEach(model.visibleItems) { item in
                    TriageInboxRow(
                        item: item,
                        isBusy: model.inFlight.contains(item.id),
                        message: model.rowMessages[item.id],
                        onEdit: { editing = item },
                        onReturn: { Task { await model.returnToTriage(item.id) } },
                        onDiscard: { discarding = item },
                        onNewExample: { Task { await model.newExample(item.id) } }
                    )
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button("Chat", systemImage: "bubble.left.and.bubble.right") { chatting = item }
                            .tint(.blue)
                            .accessibilityIdentifier("inbox-swipe-chat-\(item.id)")
                    }
                }
            }
            .accessibilityIdentifier(TriageAccessibilityID.inboxList)
        }
    }
}

private struct TriageInboxRow: View {
    let item: InboxKnowledgeBit
    let isBusy: Bool
    let message: String?
    let onEdit: () -> Void
    let onReturn: () -> Void
    let onDiscard: () -> Void
    let onNewExample: () -> Void

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 8) {
            Text(item.body)
                .zoomFont(.body)
                .fixedSize(horizontal: false, vertical: true)

            if let example = item.background, !example.isEmpty {
                ZoomHStack(alignment: .firstTextBaseline, spacing: 6) {
                    if item.exampleAiGeneratedAt != nil {
                        Text("AI")
                            .zoomFont(.caption2.weight(.bold))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(.quaternary, in: Capsule())
                            .accessibilityHidden(true)
                    }

                    Text(example)
                        .zoomFont(.footnote)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(item.exampleAiGeneratedAt != nil ? "AI example: \(example)" : "Example: \(example)")
            }

            Text("\(item.subjectName ?? "No subject"), \(item.cardCount) \(item.cardCount == 1 ? "card" : "cards")")
                .zoomFont(.caption)
                .foregroundStyle(.secondary)

            if let message {
                Text(message)
                    .zoomFont(.caption)
                    .foregroundStyle(.red)
            }

            ZoomVStack(alignment: .leading, spacing: 8) {
                ZoomHStack(spacing: 8) {
                    NavigationLink {
                        KnowledgeItemChatScreen(knowledgeBitId: item.id, bitBody: item.body)
                    } label: {
                        Label("Chat", systemImage: "bubble.left.and.bubble.right")
                    }
                    .accessibilityIdentifier(TriageAccessibilityID.inboxChat)

                    if item.note != nil {
                        Button("Edit", action: onEdit)
                            .accessibilityIdentifier(TriageAccessibilityID.inboxEdit)
                    }

                    Button("Back to triage", action: onReturn)
                        .accessibilityIdentifier(TriageAccessibilityID.inboxReturn)
                }

                ZoomHStack(spacing: 8) {
                    Button("New example", action: onNewExample)
                        .accessibilityIdentifier(TriageAccessibilityID.inboxNewExample)

                    Button("Discard", role: .destructive, action: onDiscard)
                        .accessibilityIdentifier(TriageAccessibilityID.inboxDiscard)

                    if isBusy { ProgressView() }
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(isBusy)
        }
        .zoomPadding(.vertical, 4)
        .accessibilityIdentifier(TriageAccessibilityID.inboxRow(item.id))
    }
}

struct TriageInboxLink: View {
    let count: Int

    var body: some View {
        NavigationLink {
            TriageInboxScreen()
        } label: {
            Label("Inbox, \(count)", systemImage: "tray.full")
        }
        .accessibilityIdentifier(TriageAccessibilityID.inboxLink)
    }
}
