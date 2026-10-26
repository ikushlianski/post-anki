import PostAnkiAPI
import SwiftUI

struct PendingReviewScreen: View {
    @State private var model: PendingReviewListModel
    @State private var confirmingSourceId: String?
    @State private var confirmingCount = 0
    @State private var editingBit: PendingReviewBit?
    @State private var layout = PendingReviewLayout.defaultLayout
    @State private var triage: PendingReviewTriageModel
    @State private var focus: FocusTriageModel
    @State private var session: FocusTriageSessionModel
    @State private var focusOpen = false
    @State private var retries: AttentionRetryCoordinator

    private let onDone: (() -> Void)?

    init(onDone: (() -> Void)? = nil) {
        self.onDone = onDone

        let list = PendingReviewListModel()

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
                .navigationTitle("Pending items")
                .toolbar {
                    #if os(iOS)
                    if onDone == nil {
                        ToolbarItem(placement: .topBarLeading) {
                            NavigationLink {
                                KnowledgeListScreen(isPushed: true)
                            } label: {
                                Label("All items", systemImage: "list.bullet.rectangle")
                            }
                        }
                    }
                    #endif

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
        .safeAreaInset(edge: .bottom) {
            if let undo = model.pendingUndo, !isTriageCoverShown {
                PendingReviewUndoBanner(
                    undo: undo,
                    onUndo: { Task { await model.undoReject() } },
                    onDismiss: { model.dismissUndo() }
                )
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .confirmationDialog(
            "Approve \(confirmingCount) items?",
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
            onDismiss: { Task { await model.load() } }
        ) {
            triageCover
        }
        #endif
        .task {
            await model.load()

            #if os(iOS)
            if onDone != nil, !model.sources.isEmpty, let stored = session.storedSession {
                focus.subjectFilter = stored.subjectId
                focusOpen = true
            }
            #endif
        }
        .onAppear {
            if model.hasLoaded && !model.isLoading {
                Task { await model.load() }
            }
        }
    }

    #if os(iOS)
    private func startTriage() async {
        if let stored = session.storedSession { focus.subjectFilter = stored.subjectId }

        if await session.start() { focusOpen = true }
    }
    #endif

    private var showsTriage: Bool {
        #if os(iOS)
        return focusOpen
        #else
        return layout == .triage && !model.sources.isEmpty
        #endif
    }

    private var visibleSources: [PendingReviewSource] {
        #if os(iOS)
        return PendingReviewInboxScope.visibleSources(model.sources, subjectId: focus.subjectFilter, resumed: session.storedSession)
        #else
        return model.sources
        #endif
    }

    private var isMac: Bool {
        #if os(macOS)
        return true
        #else
        return false
        #endif
    }

    #if os(iOS)
    private var triageCover: some View {
        NavigationStack {
            FocusTriageView(
                triage: focus,
                session: session,
                editingBit: $editingBit,
                onClose: { focusOpen = false }
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

    private var isTriageCoverShown: Bool {
        #if os(iOS)
        return showsTriage
        #else
        return false
        #endif
    }

    @ViewBuilder
    private var layoutToggle: some View {
        #if os(macOS)
        Picker("Layout", selection: $layout) {
            ForEach(PendingReviewLayout.allCases) { Text($0.rawValue).tag($0) }
        }
        .pickerStyle(.segmented)
        #else
        Button(layout == .list ? "Triage" : "List") {
            layout = layout == .list ? .triage : .list
        }
        #endif
    }

    @ViewBuilder
    private var content: some View {
        if !model.hasLoaded && model.errorMessage == nil {
            ProgressView()
        } else if !model.hasLoaded, let message = model.errorMessage {
            #if os(macOS)
            MacLoadStateView(failure: model.failureKind ?? .other) { Task { await model.load() } }
            #else
            ContentUnavailableView {
                Label("Couldn't load", systemImage: "exclamationmark.triangle")
            } description: {
                Text(message)
            } actions: {
                Button("Try again") { Task { await model.load() } }
            }
            #endif
        } else if model.hasLoaded && model.sources.isEmpty && model.attentionNotices.isEmpty {
            #if os(macOS)
            MacEmptyStateView(
                title: "Nothing to review",
                systemImage: "checkmark.seal",
                message: "Add knowledge from Ingest and new items appear here."
            )
            #else
            ContentUnavailableView("Nothing to review", systemImage: "checkmark.seal")
            #endif
        } else if showsTriage && isMac {
            PendingReviewTriageView(model: triage, editingBit: $editingBit)
        } else {
            List {
                if !model.attentionNotices.isEmpty {
                    AttentionBlock(
                        notices: model.attentionNotices,
                        coordinator: retries,
                        onDiscard: { await model.discardNote(sourceId: $0) }
                    )
                }

                #if os(iOS)
                if !model.sources.isEmpty {
                    Section {
                        PendingReviewInboxSummary(
                            sources: model.sources,
                            subjectId: $focus.subjectFilter,
                            resumed: session.storedSession,
                            isStarting: session.busy,
                            startError: session.error
                        )
                    }
                }
                #endif

                if let message = model.errorMessage {
                    Text(message)
                        .zoomFont(.caption)
                        .foregroundStyle(.red)
                }

                if let notice = model.notice {
                    Text(notice)
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                }

                if visibleSources.isEmpty && !model.sources.isEmpty {
                    Section {
                        ContentUnavailableView("No cards to triage in this subject", systemImage: "tray")
                    }
                }

                ForEach(visibleSources) { source in
                    Section {
                        ForEach(source.bits) { bit in
                            PendingReviewBitRow(
                                bit: bit,
                                subjectName: source.subjectName,
                                isBusy: model.inFlight.contains(bit.id),
                                message: model.rowMessages[bit.id],
                                onDecide: { decision in
                                    Task { _ = await model.decide(decision, bitId: bit.id) }
                                },
                                onEdit: { editingBit = bit }
                            )
                        }
                        SourceRegenerationRow(sourceId: source.id, pendingCount: source.bits.count) { Task { await model.load() } }
                    } header: {
                        PendingReviewSourceHeader(source: source)
                    } footer: {
                        PendingReviewSourceFooter(
                            readyCount: model.readyCount(in: source),
                            isBulkBusy: model.bulkInFlight.contains(source.id),
                            message: model.sourceMessages[source.id],
                            onApproveAll: {
                                confirmingCount = model.readyCount(in: source)
                                confirmingSourceId = source.id
                            }
                        )
                    }
                }
            }
            .refreshable { await model.load() }
            #if os(iOS)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !model.sources.isEmpty {
                    PendingReviewInboxStartBar(
                        sources: model.sources,
                        subjectId: focus.subjectFilter,
                        resumed: session.storedSession,
                        isStarting: session.busy,
                        hasError: session.error != nil
                    ) {
                        Task { await startTriage() }
                    }
                }
            }
            #endif
        }
    }
}
