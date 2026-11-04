import PostAnkiAPI
import SwiftUI

struct MacReviewSubjectsView<Session: View>: View {
    @ViewBuilder let session: (DueReviewScope?, Int) -> Session
    @State private var model = ReviewSubjectsModel()
    @State private var route: DueReviewScope?
    @State private var reviewsAll = false
    @State private var learnAhead = LearnAheadOption.off
    @State private var digest = WeeklyDigestModel()
    @State private var restored = false

    private let store = ReviewSubjectExpansionStore()

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Review")
                .navigationDestination(item: $route) { session($0, learnAhead.days) }
                .navigationDestination(isPresented: $reviewsAll) { session(nil, learnAhead.days) }
                .task {
                    if !restored {
                        model.tree.expanded = store.load()
                        restored = true
                    }

                    await model.load()
                }
                .task { await digest.load() }
                .onChange(of: model.tree.expanded) { _, value in
                    if restored { store.save(value) }
                }
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
                Button("Retry") { Task { await model.load() } }
            }
        } else if !model.hasLoaded {
            ProgressView()
        } else {
            list
        }
    }

    private var list: some View {
        List {
            WeeklyDigestCard(model: digest)

            if model.dueError != nil {
                HStack {
                    Text("Couldn't load due counts\(model.dueFailureReason.map { " (\($0))" } ?? "").")
                        .foregroundStyle(.secondary)
                    Button("Retry") { Task { await model.load() } }
                }
            }

            NavigationLink {
                RejectedCardsScreen()
            } label: {
                Label("Rejected cards", systemImage: "xmark.bin")
            }

            LearnAheadPicker(selection: $learnAhead)

            Section {
                allRow

                if model.rows.isEmpty {
                    Text("No subjects yet. Add a subject to start reviewing.")
                        .foregroundStyle(.secondary)
                }

                ForEach(model.rows) { item in
                    MacReviewSubjectRowView(
                        item: item,
                        onToggle: { withAnimation { model.toggle(item.id) } },
                        onReview: { review(item) }
                    )
                }
            } header: {
                MacReviewSubjectsHeader()
            }
        }
    }

    private var allRow: some View {
        Button { reviewsAll = true } label: {
            HStack {
                Text("All subjects").font(.headline)
                Spacer()
                MacReviewCountColumns(new: model.totalNew, repeatCount: model.totalDue)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .opacity(ReviewSubjectCountsText.isEmpty(new: model.totalNew, repeatCount: model.totalDue) ? 0.5 : 1)
        .accessibilityLabel(ReviewSubjectCountsText.accessibilityLabel(name: "All subjects", new: model.totalNew, repeatCount: model.totalDue))
    }

    private func review(_ item: ReviewSubjectRow) {
        guard let subject = model.subject(for: item.id) else { return }

        route = DueReviewScope(subject: subject)
    }
}
