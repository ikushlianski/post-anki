import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class SuspendedKnowledgeModel {
    var items: [SuspendedKnowledgeItem] = []
    var hasMore = false
    var hasLoaded = false
    var isLoading = false
    var failure: String?
    var failureKind: ProgressLoadError?
    var rowMessages: [String: String] = [:]
    var busy: Set<String> = []

    @ObservationIgnored private var offset = 0

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        failure = nil
        failureKind = nil
        defer { isLoading = false }

        do {
            let page = try await APIClient.suspendedKnowledgeBits(offset: 0)

            items = page.items
            offset = page.items.count
            hasMore = page.hasMore
            hasLoaded = true
        } catch {
            guard !KnowledgeManageError.isCancellation(error) else { return }

            failure = KnowledgeManageError.message(for: error, action: "load suspended items")
            failureKind = ProgressLoadError.from(error) ?? .other
        }
    }

    func loadMore(current item: SuspendedKnowledgeItem) async {
        guard hasMore, !isLoading, items.last?.id == item.id else { return }

        isLoading = true
        defer { isLoading = false }

        do {
            let page = try await APIClient.suspendedKnowledgeBits(offset: offset)
            let known = Set(items.map(\.id))

            items += page.items.filter { !known.contains($0.id) }
            offset += page.items.count
            hasMore = page.hasMore
        } catch {
            guard !KnowledgeManageError.isCancellation(error) else { return }

            failure = KnowledgeManageError.message(for: error, action: "load more items")
        }
    }

    func bringBack(_ item: SuspendedKnowledgeItem) async {
        guard !busy.contains(item.id) else { return }

        busy.insert(item.id)
        rowMessages[item.id] = nil
        defer { busy.remove(item.id) }

        do {
            _ = try await APIClient.setSchedule(
                id: item.id,
                suspended: item.suspended ? false : nil,
                buried: item.buriedUntil != nil ? false : nil
            )

            withAnimation { items.removeAll { $0.id == item.id } }
        } catch {
            if KnowledgeManageError.isGone(error) {
                withAnimation { items.removeAll { $0.id == item.id } }
            } else if !KnowledgeManageError.isCancellation(error) {
                rowMessages[item.id] = KnowledgeManageError.message(for: error, action: "bring this item back")
            }
        }
    }
}

struct SuspendedKnowledgeScreen: View {
    @State private var model = SuspendedKnowledgeModel()

    var body: some View {
        content
            .navigationTitle("Suspended")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .task { await model.load() }
    }

    @ViewBuilder
    private var content: some View {
        if !model.hasLoaded && model.failure == nil {
            ProgressView()
        } else if !model.hasLoaded, let message = model.failure {
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
        } else if model.items.isEmpty {
            #if os(macOS)
            MacEmptyStateView(
                title: "Nothing suspended",
                systemImage: "pause.circle",
                message: "Items you suspend from the knowledge browser show up here."
            )
            #else
            ContentUnavailableView("Nothing suspended", systemImage: "pause.circle")
            #endif
        } else {
            List {
                if let failure = model.failure {
                    Text(failure).font(.caption).foregroundStyle(.red)
                }

                ForEach(model.items) { item in
                    SuspendedKnowledgeRow(
                        item: item,
                        isBusy: model.busy.contains(item.id),
                        message: model.rowMessages[item.id]
                    ) {
                        Task { await model.bringBack(item) }
                    }
                    .task { await model.loadMore(current: item) }
                }
            }
            .refreshable { await model.load() }
        }
    }
}

private struct SuspendedKnowledgeRow: View {
    let item: SuspendedKnowledgeItem
    let isBusy: Bool
    let message: String?
    let onBringBack: () -> Void

    private var reasonText: String {
        switch item.reason {
        case "leech": return "Leech"
        case "buried":
            let relative = item.buriedUntil.flatMap { DueReviewModel.nextDueText($0) }

            return relative.map { "Buried until \($0)" } ?? "Buried"
        default: return "Suspended"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(item.question).lineLimit(2)
            Text(item.answer).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)

            HStack(spacing: 6) {
                Text(reasonText)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.quaternary, in: Capsule())

                if let name = item.subjectName { Text(name) }

                if let since = item.since.flatMap({ DueReviewModel.nextDueText($0) }) { Text("since \(since)") }
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if let message {
                Text(message).font(.caption).foregroundStyle(.red)
            }

            Button("Bring back", action: onBringBack)
                .buttonStyle(.bordered)
                .disabled(isBusy)
        }
        .padding(.vertical, 2)
        .swipeActions(edge: .trailing) {
            Button("Bring back", action: onBringBack).tint(.green).disabled(isBusy)
        }
    }
}
