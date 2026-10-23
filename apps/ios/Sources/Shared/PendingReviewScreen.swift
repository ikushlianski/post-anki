import PostAnkiAPI
import SwiftUI

struct PendingReviewScreen: View {
    @State private var model: PendingReviewListModel
    @State private var confirmingSourceId: String?
    @State private var confirmingCount = 0
    @State private var editingBit: PendingReviewBit?
    @State private var layout = PendingReviewLayout.defaultLayout
    @State private var triage: PendingReviewTriageModel

    private let onDone: (() -> Void)?

    init(onDone: (() -> Void)? = nil) {
        self.onDone = onDone

        let list = PendingReviewListModel()

        _model = State(initialValue: list)
        _triage = State(initialValue: PendingReviewTriageModel(list: list))
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
                                KnowledgeListScreen()
                            } label: {
                                Label("All items", systemImage: "list.bullet.rectangle")
                            }
                        }
                    }
                    #endif

                    ToolbarItem {
                        layoutToggle
                    }

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
        .fullScreenCover(isPresented: Binding(get: { showsTriage }, set: { if !$0 { layout = .list } })) {
            triageCover
        }
        #endif
        .task { await model.load() }
        .onAppear {
            if model.hasLoaded && !model.isLoading {
                Task { await model.load() }
            }
        }
    }

    private var showsTriage: Bool {
        layout == .triage && !model.sources.isEmpty
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
            PendingReviewTriageView(model: triage, editingBit: $editingBit)
                .navigationTitle("Pending items")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("List") { layout = .list }
                    }
                }
        }
        .safeAreaInset(edge: .bottom) {
            if let undo = model.pendingUndo {
                PendingReviewUndoBanner(
                    undo: undo,
                    onUndo: { Task { await model.undoReject() } },
                    onDismiss: { model.dismissUndo() }
                )
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
        } else if model.hasLoaded && model.sources.isEmpty {
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

                ForEach(model.sources) { source in
                    Section {
                        ForEach(source.bits) { bit in
                            PendingReviewBitRow(
                                bit: bit,
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
        }
    }
}
