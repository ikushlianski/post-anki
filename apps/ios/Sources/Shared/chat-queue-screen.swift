import PostAnkiAPI
import SwiftUI

struct ChatQueueScreen: View {
    @State private var model = ChatQueueModel.live()
    @State private var exporter = ChatQueueExportModel()
    @State private var search = ChatQueueSearchModel()
    @State private var confirmMoveAll = false
    @State private var openItem: ChatQueueItem?
    @State private var foregroundThrottle = RefreshThrottle()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        content
            .navigationTitle("Chat")
            .task { await model.load() }
            .refreshable { await model.load() }
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active, foregroundThrottle.shouldRun() else { return }

                Task {
                    await model.load()
                    await ChatQueueCountStore.shared.refresh()
                }
            }
            .searchable(text: $search.query, prompt: "Search conversations")
            .task(id: search.term) { await search.run() }
            #if os(iOS)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu("Sort", systemImage: "arrow.up.arrow.down") {
                        Picker("Sort", selection: $model.sortOrder) {
                            Text("Oldest first").tag(ChatQueueSortOrder.oldest)
                            Text("Newest first").tag(ChatQueueSortOrder.newest)
                        }
                    }
                    .accessibilityIdentifier("chat-queue-sort")
                }

                ToolbarItem(placement: .topBarTrailing) {
                    ChatQueueExportMenu(subjects: ChatQueueExportSubjects.from(model.items), model: exporter)
                }
            }
            .sheet(item: Binding(get: { exporter.file }, set: { if $0 == nil { exporter.dismissFile() } })) { file in
                ChatQueueExportSheet(file: file) { exporter.dismissFile() }
            }
            #endif
    }

    @ViewBuilder
    private var content: some View {
        if search.isActive {
            List {
                ChatQueueSearchResults(state: search.state, items: model.items) { item in
                    AnyView(thread(for: item))
                }
            }
            .accessibilityIdentifier("chat-queue-search-results")
        } else if !model.hasLoaded, model.errorMessage == nil {
            ProgressView()
        } else if model.items.isEmpty {
            ContentUnavailableView {
                Label(
                    model.errorMessage == nil ? "Chat is empty" : "Couldn't load",
                    systemImage: model.errorMessage == nil ? "bubble.left.and.bubble.right" : "exclamationmark.triangle"
                )
            } description: {
                Text(model.errorMessage ?? "While triaging, swipe a card up or tap Chat to park it here and ask the tutor about it before you decide.")
            } actions: {
                if model.errorMessage != nil { Button("Try again") { Task { await model.load() } } }
            }
        } else {
            List(selection: $model.picked) {
                if let summary = ChatQueueSummary.label(model.items) {
                    Text(summary)
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("chat-queue-summary")
                }

                if let wait = ChatQueueWaiting.oldestWaitLabel(model.items) {
                    Text(wait)
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("chat-queue-oldest-wait")
                }

                if !model.subjectNames.isEmpty {
                    Picker("Subject", selection: $model.subject) {
                        Text("All subjects").tag(String?.none)

                        ForEach(model.subjectNames, id: \.self) { name in
                            Text(verbatim: name).tag(Optional(name))
                        }
                    }
                    .accessibilityIdentifier("chat-queue-subject")
                }

                if model.hasStaleItems {
                    Toggle(isOn: $model.staleOnly) {
                        Label("Waiting over \(ChatQueueWaiting.staleDays) days", systemImage: "hourglass")
                    }
                    .toggleStyle(.button)
                    .accessibilityIdentifier("chat-queue-stale-chip")
                }

                if model.isStaleFilterActive, !model.movableVisibleItems.isEmpty {
                    Button("Move all to Inbox", systemImage: "tray.and.arrow.down") { confirmMoveAll = true }
                        .disabled(model.isMovingAll)
                        .accessibilityIdentifier("chat-queue-move-all")
                }

                if let message = exporter.errorMessage {
                    Text(message)
                        .zoomFont(.caption)
                        .foregroundStyle(.red)
                        .accessibilityIdentifier("chat-queue-export-error")
                }

                if let message = model.errorMessage {
                    Text(message)
                        .zoomFont(.caption)
                        .foregroundStyle(.red)
                }

                if let notice = model.bulkNotice {
                    Text(notice)
                        .zoomFont(.caption)
                        .foregroundStyle(.red)
                        .accessibilityIdentifier("chat-queue-bulk-notice")
                }

                if let truncation = model.truncation {
                    Text(truncation.message)
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("chat-queue-truncated-notice")
                }

                ForEach(model.sortedItems) { item in
                    row(for: item)
                    .accessibilityIdentifier("chat-queue-row-\(item.id)")
                    .swipeActions(edge: .trailing) {
                        inboxAction(for: item)
                        snoozeActions(for: item)
                    }
                    .contextMenu {
                        ChatQueueBulkMenu(model: model, item: item)
                        snoozeActions(for: item)
                    }
                }
            }
            .accessibilityIdentifier("chat-queue-list")
            .modifier(ChatQueueBulkControls(model: model))
            #if os(macOS)
            .navigationDestination(item: $openItem) { thread(for: $0) }
            #endif
            .confirmationDialog(
                "Move \(model.movableVisibleItems.count) \(model.movableVisibleItems.count == 1 ? "card" : "cards") to Inbox?",
                isPresented: $confirmMoveAll,
                titleVisibility: .visible
            ) {
                Button("Move all to Inbox") { Task {
                    let moved = await model.moveAllVisibleToInbox()

                    if moved > 0 { TriageFeedbackPlayer.announce(.movedAllToInbox(count: moved)) }
                } }
                Button("Cancel", role: .cancel) {}
            }
        }
    }
}

extension ChatQueueScreen {
    @ViewBuilder
    fileprivate func row(for item: ChatQueueItem) -> some View {
        #if os(macOS)
        ChatQueueRow(item: item)
            .contentShape(Rectangle())
            .onTapGesture(count: 2) { openItem = item }
        #else
        NavigationLink {
            thread(for: item)
        } label: {
            ChatQueueRow(item: item)
        }
        #endif
    }

    fileprivate func thread(for item: ChatQueueItem) -> some View {
        ChatQueueThreadScreen(
            item: item,
            onResolved: { model.resolved(item.id) },
            onSnoozed: { Task { await model.load() } },
            onCardUpdated: { Task { await model.load() } }
        )
    }

    fileprivate func inboxAction(for item: ChatQueueItem) -> some View {
        Button("Inbox", systemImage: "tray.and.arrow.down") { Task {
            if await model.returnToInbox(item.id) { TriageFeedbackPlayer.announce(.movedToInbox) }
        } }
            .tint(.blue)
            .accessibilityIdentifier("chat-queue-inbox-\(item.id)")
    }

    @ViewBuilder
    fileprivate func snoozeActions(for item: ChatQueueItem) -> some View {
        if item.isSnoozed() {
            Button("Unsnooze", systemImage: "bell") { Task { await model.unsnooze(item.id) } }
                .accessibilityIdentifier("chat-queue-unsnooze-\(item.id)")
        } else {
            Menu("Snooze", systemImage: "moon.zzz") {
                ForEach(ChatQueueSnoozeOptions.days, id: \.self) { days in
                    Button(ChatQueueSnoozeOptions.label(days: days)) { Task {
                        await model.snooze(item.id, days: days)

                        if model.errorMessage == nil { TriageFeedbackPlayer.announce(.snoozed(days: days)) }
                    } }
                }
            }
            .accessibilityIdentifier("chat-queue-snooze-\(item.id)")
        }
    }
}

private struct ChatQueueRow: View {
    let item: ChatQueueItem

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 4) {
            Text(verbatim: item.body)
                .zoomFont(.body)
                .lineLimit(3)

            ZoomHStack(spacing: 8) {
                if let subject = item.subjectName {
                    Text(verbatim: subject)
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                }

                Text(turnsText)
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)

                Text(ChatQueueWaiting.label(chatAt: item.chatAt))
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
            }

            if item.reviewChat {
                Text("From review")
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("chat-queue-review-label")
            }

            if item.isSnoozed(), let until = item.snoozedUntil {
                Text("Snoozed until \(until.formatted(date: .abbreviated, time: .omitted))")
                    .zoomFont(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var turnsText: String {
        item.turnsLeft <= 0 ? "Limit reached" : "\(item.turnsLeft) left"
    }
}

struct ChatQueueLink: View {
    @State private var counts = ChatQueueCountStore.shared

    var body: some View {
        NavigationLink {
            ChatQueueScreen()
        } label: {
            Label(counts.count > 0 ? "Chat, \(counts.count)" : "Chat", systemImage: "bubble.left.and.bubble.right")
        }
        .task { await counts.refresh() }
        .accessibilityIdentifier("chat-queue-link")
    }
}
