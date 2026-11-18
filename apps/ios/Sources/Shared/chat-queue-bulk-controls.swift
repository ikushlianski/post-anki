import PostAnkiAPI
import SwiftUI

struct ChatQueueBulkControls: ViewModifier {
    @Bindable var model: ChatQueueModel
    #if os(iOS)
    @Environment(\.editMode) private var editMode
    #endif

    func body(content: Content) -> some View {
        content
            .toolbar { toolbarItems }
            .confirmationDialog(
                confirmTitle,
                isPresented: $model.isConfirmingBulk,
                titleVisibility: .visible
            ) {
                if model.confirmingAction == .delete {
                    Button("Delete", role: .destructive) { Task { await ChatQueueBulkAnnouncer.run(model, .delete) } }
                } else {
                    Button("Move to Inbox") { Task { await ChatQueueBulkAnnouncer.run(model) } }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                if model.confirmingAction == .delete { Text("This cannot be undone.") }
            }
            #if os(iOS)
            .onChange(of: editMode?.wrappedValue.isEditing ?? false) { _, editing in
                if !editing { model.clearPicked() }
            }
            #endif
    }

    private var confirmTitle: String {
        let count = model.pickedIds.count

        if model.confirmingAction == .delete { return "Delete \(count) \(count == 1 ? "chat" : "chats")?" }

        return "Move \(count) cards to Inbox?"
    }

    @ToolbarContentBuilder
    private var toolbarItems: some ToolbarContent {
        #if os(iOS)
        ToolbarItem(placement: .topBarLeading) {
            EditButton().accessibilityIdentifier("chat-queue-edit")
        }

        if editMode?.wrappedValue.isEditing == true {
            ToolbarItemGroup(placement: .bottomBar) {
                Button("Select all") { model.pickAllVisible() }
                    .disabled(model.isBulkRunning)

                Spacer()

                snoozeMenu

                moveButton

                deleteButton
            }
        }
        #else
        ToolbarItemGroup(placement: .primaryAction) {
            snoozeMenu
            moveButton
            deleteButton
        }
        #endif
    }

    private var snoozeMenu: some View {
        Menu {
            ForEach(ChatQueueSnoozeOptions.days, id: \.self) { days in
                Button(ChatQueueSnoozeOptions.label(days: days)) {
                    Task { await ChatQueueBulkAnnouncer.snooze(model, days: days) }
                }
            }
        } label: {
            Label("Snooze", systemImage: "moon.zzz").zoomFont(.body)
        }
        .disabled(model.isBulkRunning || !model.hasPicked)
        .accessibilityIdentifier("chat-queue-bulk-snooze")
    }

    private var deleteButton: some View {
        Button(role: .destructive) {
            Task { await ChatQueueBulkAnnouncer.requestDelete(model) }
        } label: {
            Label("Delete", systemImage: "trash").zoomFont(.body)
        }
        .disabled(model.isBulkRunning || !model.hasPicked)
        .accessibilityIdentifier("chat-queue-bulk-delete")
    }

    private var moveButton: some View {
        Button {
            Task { await ChatQueueBulkAnnouncer.request(model) }
        } label: {
            Label(model.isBulkRunning ? "Moving…" : "Move to Inbox", systemImage: "tray.and.arrow.down")
                .zoomFont(.body)
        }
        .disabled(model.isBulkRunning || !model.hasPicked)
        .accessibilityIdentifier("chat-queue-bulk-move")
    }
}

@MainActor
enum ChatQueueBulkAnnouncer {
    static func request(_ model: ChatQueueModel, on id: String? = nil) async {
        let moved = if let id {
            await model.requestBulk(.moveToInbox, on: id)
        } else {
            await model.requestBulk(.moveToInbox)
        }

        announce(moved)
    }

    static func snooze(_ model: ChatQueueModel, days: Int, on id: String? = nil) async {
        let count = if let id {
            await model.requestBulk(.snooze(days: days), on: id)
        } else {
            await model.requestBulk(.snooze(days: days))
        }

        if count > 0 { TriageFeedbackPlayer.announce(.snoozed(days: days)) }
    }

    static func run(_ model: ChatQueueModel, _ action: ChatQueueBulkAction = .moveToInbox) async {
        let done = await model.runBulk(action)

        if action == .moveToInbox { announce(done) }
    }

    static func requestDelete(_ model: ChatQueueModel, on id: String? = nil) async {
        if let id {
            await model.requestBulk(.delete, on: id)
        } else {
            await model.requestBulk(.delete)
        }
    }


    private static func announce(_ moved: Int) {
        if moved > 0 { TriageFeedbackPlayer.announce(.movedAllToInbox(count: moved)) }
    }
}

struct ChatQueueBulkMenu: View {
    let model: ChatQueueModel
    let item: ChatQueueItem

    var body: some View {
        if !item.reviewChat {
            Button("Move to Inbox", systemImage: "tray.and.arrow.down") {
                Task { await ChatQueueBulkAnnouncer.request(model, on: item.id) }
            }
            .disabled(model.isBulkRunning)
            .accessibilityIdentifier("chat-queue-bulk-menu-\(item.id)")
        }

        if !item.reviewChat {
            Button("Delete…", systemImage: "trash", role: .destructive) {
                Task { await ChatQueueBulkAnnouncer.requestDelete(model, on: item.id) }
            }
            .disabled(model.isBulkRunning)
            .accessibilityIdentifier("chat-queue-bulk-delete-menu-\(item.id)")
        }

        if model.picked.count > 1, model.picked.contains(item.id), !item.reviewChat {
            Menu("Snooze selected", systemImage: "moon.zzz") {
                ForEach(ChatQueueSnoozeOptions.days, id: \.self) { days in
                    Button(ChatQueueSnoozeOptions.label(days: days)) {
                        Task { await ChatQueueBulkAnnouncer.snooze(model, days: days, on: item.id) }
                    }
                }
            }
            .disabled(model.isBulkRunning)
            .accessibilityIdentifier("chat-queue-bulk-snooze-menu-\(item.id)")
        }
    }
}
