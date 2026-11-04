import PostAnkiAPI
import SwiftUI

struct RejectedCardsScreen: View {
    @State fileprivate var model = RejectedCardsModel()
    @State private var debouncer: RejectedSearchDebouncer?

    var body: some View {
        VStack(spacing: 0) {
            RejectedSubjectMenu(
                selected: model.subjectId,
                options: model.subjectOptions,
                notice: model.subjectsNotice,
                onSelect: { id in Task { await model.selectSubject(id) } },
                onRetry: { Task { await model.loadSubjects() } }
            )

            RejectedReasonChips(selected: model.reason, counts: model.counts) { reason in
                Task { await model.select(reason) }
            }

            content
        }
        .navigationTitle("Rejected cards")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                if model.hasLoaded, !model.items.isEmpty {
                    Button(model.isSelecting ? "Done" : "Select") { model.setSelecting(!model.isSelecting) }
                        .disabled(model.bulkRunning)
                        .accessibilityIdentifier("rejected-cards-select-toggle")
                }
            }
        }
        .searchable(text: $model.draft, prompt: "Search rejected cards")
        .onChange(of: model.draft) { _, draft in debouncer?.input(draft) }
        .task {
            debouncer = RejectedSearchDebouncer { [model] term in Task { await model.search(term) } }
            async let subjects: Void = model.loadSubjects()
            await model.load()
            await subjects
        }
        .onDisappear { debouncer?.cancel() }
    }

    @ViewBuilder
    private var content: some View {
        if !model.hasLoaded, let message = model.failure {
            ContentUnavailableView {
                Label("Couldn't load", systemImage: "exclamationmark.triangle")
            } description: {
                Text(message)
            } actions: {
                Button("Try again") { Task { await model.load() } }
            }
        } else if !model.hasLoaded {
            ProgressView().frame(maxHeight: .infinity)
        } else if model.items.isEmpty {
            ContentUnavailableView(
                RejectedSearchQuery.emptyTitle(query: model.query, reason: model.reason, hasSubject: model.subjectId != nil),
                systemImage: "xmark.bin"
            )
        } else {
            List {
                if let failure = model.failure {
                    Text(failure).font(.caption).foregroundStyle(.red)
                }

                if let notice = model.notice {
                    Text(notice).font(.caption).foregroundStyle(.secondary)
                }

                if model.isSelecting {
                    selectionBar
                }

                ForEach(model.items) { card in
                    HStack(alignment: .top, spacing: 10) {
                        if model.isSelecting {
                            selectionToggle(card)
                        }

                        VStack(alignment: .leading, spacing: 4) {
                            Text(CardKind.hideBlanks(card.body)).lineLimit(4)
                            Text(reasonLine(card)).font(.caption).foregroundStyle(.secondary)
                            RejectedSourceTitle(card: card)
                            RejectedNoteText(card: card)

                            if model.selection.hasFailed(card.id) {
                                Text("Could not restore this card. Try again.").font(.caption).foregroundStyle(.red)
                            }
                        }
                    }
                    .padding(.vertical, 2)
                    .task { await model.loadMore(current: card) }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        if !model.isSelecting {
                            Button("Restore") { Task { await model.restore(card) } }
                                .tint(.green)
                                .disabled(model.restoringId != nil)

                            Button("Send to Chat") { Task { await model.sendToChat(card) } }
                                .tint(.blue)
                                .disabled(model.restoringId != nil)
                        }
                    }
                }

                if model.hasMore {
                    HStack { Spacer(); ProgressView(); Spacer() }
                }
            }
            .refreshable { await model.load() }
        }
    }
}

extension RejectedCardsScreen {
    fileprivate var selectionBar: some View {
        let ids = model.items.map(\.id)

        return HStack {
            Button(model.selection.allSelected(in: ids) ? "Select none" : "Select all") {
                if model.selection.allSelected(in: ids) { model.selection.clear() } else { model.selection.selectAll(ids) }
            }
            .accessibilityIdentifier("rejected-cards-select-all")

            Spacer()

            Button(model.selection.buttonTitle(isRunning: model.bulkRunning)) { Task { await model.restoreSelected() } }
                .buttonStyle(.borderedProminent)
                .disabled(model.selection.isEmpty || model.bulkRunning)
                .accessibilityIdentifier("rejected-cards-restore-selected")
        }
        .buttonStyle(.borderless)
    }

    fileprivate func selectionToggle(_ card: RejectedCard) -> some View {
        let on = model.selection.contains(card.id)

        return Button {
            model.selection.toggle(card.id)
        } label: {
            Image(systemName: on ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(on ? Color.accentColor : .secondary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Select card")
        .accessibilityAddTraits(on ? .isSelected : [])
        .accessibilityIdentifier("rejected-card-select-\(card.id)")
    }
}

private func reasonLine(_ card: RejectedCard) -> String {
    guard let day = RejectedDateLabel.day(card.decidedAt) else { return card.reasonLabel }

    return "\(card.reasonLabel) · \(day)"
}
