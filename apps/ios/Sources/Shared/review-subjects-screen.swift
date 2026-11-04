import PostAnkiAPI
import SwiftUI

struct ReviewSubjectsScreen<Session: View>: View {
    @ViewBuilder let session: (DueReviewScope?, Int) -> Session
    @State private var model = ReviewSubjectsModel()
    @State private var selectedId: String?
    @State private var route: DueReviewScope?
    @State private var reviewsAll = false
    @State private var learnAhead = LearnAheadOption.off
    @State private var digest = WeeklyDigestModel()

    private let allId = "all"

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Review")
                .navigationDestination(item: $route) { session($0, learnAhead.days) }
                .navigationDestination(isPresented: $reviewsAll) { session(nil, learnAhead.days) }
                .task { await model.load() }
                .task { await digest.load() }
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
                WeeklyDigestCard(model: digest)

                if model.dueError != nil {
                    Text("Couldn't load due counts\(model.dueFailureReason.map { " (\($0))" } ?? "").")
                        .foregroundStyle(.secondary)
                }

                if let note = model.tree.countsNote {
                    Text(note).foregroundStyle(.secondary)
                }

                NavigationLink {
                    RejectedCardsScreen()
                } label: {
                    Label("Rejected cards", systemImage: "xmark.bin")
                }

                LearnAheadPicker(selection: $learnAhead)

                allRow

                ForEach(model.rows) { item in
                    ReviewSubjectRowView(item: item, isSelected: selectedId == item.id) {
                        withAnimation { model.toggle(item.id) }
                    }
                    .contentShape(Rectangle())
                    .accessibilityAddTraits(.isButton)
                    .onTapGesture { selectedId = item.id }
                    .listRowBackground(selectedId == item.id ? Color.accentColor.opacity(0.15) : nil)
                }
            }
            .refreshable {
                await model.load()
                await digest.load()
            }
        }
    }

    private var allRow: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("All subjects").font(.headline)
                Text(ReviewSubjectSummary.text(due: model.totalDue, new: model.totalNew))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(model.overallMaturity.percentSummary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                CardMaturityBar(breakdown: model.overallMaturity)
            }

            Spacer()

            if selectedId == allId || selectedId == nil {
                Image(systemName: "checkmark").foregroundStyle(.tint)
            }
        }
        .contentShape(Rectangle())
        .accessibilityAddTraits(.isButton)
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
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("\(item.row.isExpanded ? "Collapse" : "Expand") \(item.entry.name)")
            } else {
                Color.clear.frame(width: 44, height: 44)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(item.entry.name).font(.body).lineLimit(2)
                Text("\(item.summary) · \(CountLabel.text(item.entry.count, "card"))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if !item.maturity.isEmpty {
                    Text(item.maturity.countsSummary)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer(minLength: 8)

            SubjectDepthBar(entry: item.entry)
        }
        .padding(.leading, CGFloat(item.row.depth) * 16)
    }
}

struct LearnAheadPicker: View {
    @Binding var selection: LearnAheadOption

    var body: some View {
        Picker(selection: $selection) {
            ForEach(LearnAheadOption.allCases) { Text($0.title).tag($0) }
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text("Learn ahead")
                Text("Also review cards that are not due yet")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .pickerStyle(.menu)
    }
}
