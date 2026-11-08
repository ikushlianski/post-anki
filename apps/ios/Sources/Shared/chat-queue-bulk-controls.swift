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
                "Move \(model.pickedIds.count) cards to Inbox?",
                isPresented: $model.isConfirmingBulk,
                titleVisibility: .visible
            ) {
                Button("Move to Inbox") { Task { await ChatQueueBulkAnnouncer.run(model) } }
                Button("Cancel", role: .cancel) {}
            }
            #if os(iOS)
            .onChange(of: editMode?.wrappedValue.isEditing ?? false) { _, editing in
                if !editing { model.clearPicked() }
            }
            #endif
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

                moveButton
            }
        }
        #else
        ToolbarItem(placement: .primaryAction) { moveButton }
        #endif
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

    static func run(_ model: ChatQueueModel) async {
        announce(await model.runBulk(.moveToInbox))
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
    }
}
