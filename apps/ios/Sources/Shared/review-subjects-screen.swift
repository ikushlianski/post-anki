import PostAnkiAPI
import SwiftUI

struct ReviewSubjectsScreen: View {
    @State private var model = ReviewSubjectsModel()
    @State private var selectedId: String?
    @State private var route: DueReviewScope?
    @State private var reviewsAll = false

    private let allId = "all"

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Review")
                .navigationDestination(item: $route) { DueReviewScreen(scope: $0) }
                .navigationDestination(isPresented: $reviewsAll) { DueReviewScreen() }
                .task { await model.load() }
                .mainActionControls([startTile])
        }
    }

    @ViewBuilder
    private var content: some View {
        if !model.hasLoaded, let message = model.errorMessage {
            ContentUnavailableView {
                Label("Couldn't load", systemImage: "exclamationmark.triangle")
            } description: {
                Text(message)
            } actions: {
                Button("Try again") { Task { await model.load() } }
            }
        } else if !model.hasLoaded {
            ProgressView()
        } else {
            List {
                if model.dueError != nil {
                    Text("Couldn't load due counts.").foregroundStyle(.secondary)
                }

                allRow

                ForEach(model.rows) { item in
                    ReviewSubjectRowView(item: item, isSelected: selectedId == item.id) {
                        withAnimation { model.toggle(item.id) }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { selectedId = item.id }
                    .listRowBackground(selectedId == item.id ? Color.accentColor.opacity(0.15) : nil)
                }
            }
            .refreshable { await model.load() }
        }
    }

    private var allRow: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("All subjects").font(.headline)
                Text(ReviewSubjectSummary.text(due: model.totalDue, new: model.totalNew))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if selectedId == allId || selectedId == nil {
                Image(systemName: "checkmark").foregroundStyle(.tint)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { selectedId = allId }
        .listRowBackground(selectedId == allId ? Color.accentColor.opacity(0.15) : nil)
    }

    private var startTile: MainActionTile {
        MainActionTile(title: startTitle, style: .prominent) { start() }
    }

    private var startTitle: String {
        guard let id = selectedId, id != allId, let name = model.subject(for: id)?.name else { return "Start review" }

        return "Start review: \(name)"
    }

    private func start() {
        guard let id = selectedId, id != allId, let subject = model.subject(for: id) else {
            reviewsAll = true

            return
        }

        route = DueReviewScope(subject: subject)
    }
}

private struct ReviewSubjectRowView: View {
    let item: ReviewSubjectRow
    let isSelected: Bool
    let onToggle: () -> Void

    private var hasChildren: Bool { !item.row.node.children.isEmpty }

    var body: some View {
        HStack(spacing: 8) {
            if hasChildren {
                Button(action: onToggle) {
                    Image(systemName: item.row.isExpanded ? "chevron.down" : "chevron.right")
                        .frame(width: 28, height: 36)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
            } else {
                Color.clear.frame(width: 28, height: 36)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(item.entry.name).font(.body).lineLimit(2)
                Text("\(item.summary) · \(item.entry.count) cards")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            SubjectDepthBar(entry: item.entry)
        }
        .padding(.leading, CGFloat(item.row.depth) * 16)
    }
}
