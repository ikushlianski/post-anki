import PostAnkiAPI
import SwiftUI

extension PendingReviewScreen {
    @ViewBuilder
    var itemSections: some View {
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

    #if os(iOS)
    @ViewBuilder
    var collapsibleItems: some View {
        if !model.sources.isEmpty {
            Section {
                Button {
                    showsAllItems.toggle()
                } label: {
                    HStack {
                        Text(TriageEntryChoice.showAllTitle(TriageEntryChoice.totalItems(model.sources)))
                        Spacer()
                        Image(systemName: showsAllItems ? "chevron.up" : "chevron.down")
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("show-all-items")
            }
        }

        if showsAllItems { itemSections }
    }
    #endif
}
