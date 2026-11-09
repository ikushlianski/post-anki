import PostAnkiAPI
import SwiftUI

extension PendingReviewScreen {
    #if os(iOS)
    func startTriage() async {
        if let stored = session.storedSession { focus.subjectFilter = stored.subjectId }

        if await session.start() { focusOpen = true }
    }

    func startTriage(subjectId: String?) {
        focus.subjectFilter = subjectId

        Task { await startTriage() }
    }
    #endif

    func startMacTriage(subjectId: String?) {
        Task {
            await triage.setScope(subjectId)
            await triage.recorder.begin(subjectId: subjectId)
            macTriageStarted = true
        }
    }

    func leaveMacTriage() {
        macTriageStarted = false
        triage.subjectFilter = nil
        model.scopeSubjectId = nil

        Task {
            await triage.settlePending()
            await triage.recorder.end(undecidedCount: triage.remaining)
            await model.load()
            await subjects.load()
        }
    }

    var showsTriage: Bool {
        #if os(iOS)
        return focusOpen
        #else
        return layout == .triage && !model.sources.isEmpty
        #endif
    }

    var visibleSources: [PendingReviewSource] {
        #if os(iOS)
        return PendingReviewInboxScope.visibleSources(model.sources, subjectId: focus.subjectFilter, resumed: session.storedSession)
        #else
        return model.sources
        #endif
    }

    var isMac: Bool {
        #if os(macOS)
        return true
        #else
        return false
        #endif
    }

    @ViewBuilder
    var layoutToggle: some View {
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

    var isEmptyState: Bool {
        model.hasLoaded && model.sources.isEmpty && model.attentionNotices.isEmpty
    }

    @ViewBuilder
    var content: some View {
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
        } else if isEmptyState {
            #if os(macOS)
            ContentUnavailableView {
                Label("Nothing to review", systemImage: "checkmark.seal")
            } description: {
                Text(TriageText.emptyHint)
            }
            #else
            ContentUnavailableView {
                Label("Nothing to review", systemImage: "checkmark.seal")
            } description: {
                Text(TriageText.emptyHint)
            } actions: {
                ChatQueueLink()

                if model.counts.inboxCount > 0 { TriageInboxLink(count: model.counts.inboxCount) }
            }
            #endif
        } else if showsTriage && isMac && !macTriageStarted {
            List {
                TriageSubjectsSection(
                    model: subjects,
                    onPick: { startMacTriage(subjectId: $0) },
                    onTriageAll: { startMacTriage(subjectId: nil) }
                )
            }
            .refreshable { await subjects.load() }
        } else if showsTriage && isMac {
            PendingReviewTriageView(
                model: triage,
                editingBit: $editingBit,
                onBackToSubjects: {
                    leaveMacTriage()
                    onTriageFinished?()
                }
            )
                .saveFailurePrompt(
                    triage.saveFailure,
                    onRetry: { Task { await triage.retryFailedSave() } },
                    onSkip: { Task { await triage.skipFailedSave() } }
                )
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
                Section { ChatQueueLink() }

                if model.counts.inboxCount > 0 {
                    Section { TriageInboxLink(count: model.counts.inboxCount) }
                }

                if !model.sources.isEmpty {
                    if session.storedSession == nil {
                        TriageSubjectsSection(
                            model: subjects,
                            isStarting: session.busy,
                            startError: session.error,
                            onPick: { startTriage(subjectId: $0) },
                            onTriageAll: { startTriage(subjectId: nil) }
                        )
                    } else {
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
                            .onAppear { model.rowAppeared(bit.id) }
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
            .refreshable {
                await model.load()
                await subjects.load()
            }
            #if os(iOS)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !model.sources.isEmpty, session.storedSession != nil {
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
