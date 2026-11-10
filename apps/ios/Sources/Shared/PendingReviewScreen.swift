import PostAnkiAPI
import SwiftUI

struct PendingReviewScreen: View {
    @State var model: PendingReviewListModel
    @State var confirmingSourceId: String?
    @State var confirmingCount = 0
    @State var editingBit: PendingReviewBit?
    @State var layout = PendingReviewLayout.defaultLayout
    @State var triage: PendingReviewTriageModel
    @State var focus: FocusTriageModel
    @State var session: FocusTriageSessionModel
    @State var focusOpen = false
    @State var showsAllItems = false
    @State var retries: AttentionRetryCoordinator
    @State var subjects = TriageSubjectsModel()
    @State var macTriageStarted = false

    private let onDone: (() -> Void)?
    let onTriageFinished: (() -> Void)?

    private static var windowsInbox: Bool {
        #if os(macOS)
        return true
        #else
        return false
        #endif
    }

    init(onDone: (() -> Void)? = nil, onTriageFinished: (() -> Void)? = nil) {
        self.onDone = onDone
        self.onTriageFinished = onTriageFinished

        let list = PendingReviewListModel(windowed: PendingReviewScreen.windowsInbox)

        _model = State(initialValue: list)
        _triage = State(initialValue: PendingReviewTriageModel(list: list))

        let focusModel = FocusTriageModel(list: list)

        _focus = State(initialValue: focusModel)
        _session = State(initialValue: FocusTriageSessionModel(triage: focusModel))
        _retries = State(initialValue: AttentionRetryCoordinator(onFinished: { await list.load() }))
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(TriageText.inboxTitle)
                .toolbar {
                    #if os(iOS)
                    if onDone == nil {
                        ToolbarItem(placement: .topBarLeading) {
                            NavigationLink {
                                KnowledgeListScreen(isPushed: true)
                            } label: {
                                Label("All items", systemImage: "list.bullet.rectangle")
                                    .labelStyle(.titleAndIcon)
                            }
                        }
                    }
                    #endif

                    if let undo = model.pendingUndo, undo.canRetry, !isTriageCoverShown {
                        ToolbarItem(placement: .primaryAction) {
                            Button("Undo") { Task { await model.undoReject() } }
                                .disabled(undo.isRestoring)
                        }
                    }

                    #if os(macOS)
                    ToolbarItem {
                        layoutToggle
                    }
                    #endif

                    #if os(macOS)
                    if onDone == nil {
                        ToolbarItem {
                            Button {
                                Task { await model.load() }
                            } label: {
                                Label("Reload", systemImage: "arrow.clockwise")
                            }
                            .keyboardShortcut("r", modifiers: .command)
                            .disabled(model.isLoading)
                        }
                    }
                    #endif

                    if let onDone {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done", action: onDone)
                                .disabled(model.pendingUndo != nil)
                        }
                    }
                }
        }
        .confirmationDialog(
            "Approve \(CountLabel.text(confirmingCount, "item"))?",
            isPresented: Binding(
                get: { confirmingSourceId != nil },
                set: { if !$0 { confirmingSourceId = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Approve") {
                if let id = confirmingSourceId {
                    Task { await model.approveAll(sourceId: id) }
                }

                confirmingSourceId = nil
            }
            Button("Cancel", role: .cancel) { confirmingSourceId = nil }
        }
        .pendingReviewSheets(model: model, editingBit: $editingBit, isEnabled: !isTriageCoverShown)
        #if os(iOS)
        .fullScreenCover(
            isPresented: Binding(get: { focusOpen }, set: { focusOpen = $0 }),
            onDismiss: {
                if session.storedSession == nil { focus.subjectFilter = nil }

                Task {
                    await model.load()
                    await subjects.load()
                }
            }
        ) {
            triageCover
        }
        #endif
        .task {
            async let loadedSubjects: Void = subjects.load()

            await model.load()
            await loadedSubjects

            #if os(iOS)
            if onDone != nil, !model.sources.isEmpty, let stored = session.storedSession {
                focus.subjectFilter = stored.subjectId
                focusOpen = true
            }
            #endif
        }
        .onChange(of: triage.current == nil) { wasEmpty, isEmpty in
            guard isMac, macTriageStarted, !wasEmpty, isEmpty else { return }

            leaveMacTriage()
            onTriageFinished?()
        }
        .onChange(of: layout) { _, newLayout in
            guard isMac, macTriageStarted else { return }

            Task { await triage.layoutChanged(toTriage: newLayout == .triage) }
        }
        .onAppear {
            if model.hasLoaded && !model.isLoading {
                Task {
                    await model.load()
                    await subjects.load()
                }
            }
        }
    }

    #if os(iOS)
    private var triageCover: some View {
        NavigationStack {
            FocusTriageView(
                triage: focus,
                session: session,
                editingBit: $editingBit,
                onClose: { focusOpen = false },
                onFinished: { focusOpen = false; onTriageFinished?() }
            )
            .navigationTitle("Triage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("List") { focusOpen = false }
                }
            }
        }
        .pendingReviewSheets(model: model, editingBit: $editingBit)
    }
    #endif

    var isTriageCoverShown: Bool {
        #if os(iOS)
        return showsTriage
        #else
        return false
        #endif
    }
}
