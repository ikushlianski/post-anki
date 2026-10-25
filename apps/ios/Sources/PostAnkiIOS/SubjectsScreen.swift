import PostAnkiAPI
import SwiftUI

struct SubjectsScreen: View {
    @State private var model = CoursesScreenModel()
    @State private var showsProfile = false

    var body: some View {
        NavigationStack {
            List {
                ForEach(model.topLevelSubjects) { subject in
                    NavigationLink(value: subject) {
                        SubjectRow(subject: subject, childCount: model.children(of: subject.id).count)
                    }
                }

                Section {
                    NavigationLink {
                        SubjectManageScreen(onChange: { Task { await model.load() } })
                    } label: {
                        Label("Manage subjects", systemImage: "folder.badge.gearshape")
                    }
                }

                if let errorMessage = model.errorMessage {
                    Text(errorMessage).foregroundStyle(.red)
                }
            }
            .navigationTitle("Subjects")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showsProfile = true } label: { Image(systemName: "person.crop.circle") }
                }
            }
            .sheet(isPresented: $showsProfile) {
                NavigationStack { SettingsScreen() }
            }
            .refreshable { await model.load() }
            .task { await model.load() }
            .navigationDestination(for: Subject.self) { subject in
                SubjectDetailScreen(subject: subject, subjects: model.subjects)
            }
        }
    }
}

private struct SubjectRow: View {
    let subject: Subject
    let childCount: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(subject.name).font(.headline)

            if childCount > 0 {
                Text("\(childCount) sub-subjects")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else if let description = subject.description, !description.isEmpty {
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 2)
    }
}

struct SubjectDetailScreen: View {
    let subject: Subject
    let subjects: [Subject]

    @State private var cards: [KnowledgeOverviewItem] = []
    @State private var isLoading = true
    @State private var failed = false
    @State private var hasMore = false
    @State private var gapModel = SubjectGapCloseModel()
    @State private var showsReview = false

    private var hardest: [KnowledgeOverviewItem] { SubjectHardestCards.rank(cards) }

    private var closeId: String? { gapModel.effectiveId(in: hardest) }

    private var children: [Subject] {
        subjects.filter { $0.parentId == subject.id }
    }

    var body: some View {
        List {
            if !isLoading && !failed {
                SubjectStatsHeader(
                    countText: SubjectHardestCards.countText(cards: cards, hasMore: hasMore),
                    hardestCount: hardest.count
                )
                SubjectHardestSection(hardest: hardest, model: gapModel)
            }

            if !children.isEmpty {
                Section("Sub-subjects") {
                    ForEach(children) { child in
                        NavigationLink {
                            SubjectDetailScreen(subject: child, subjects: subjects)
                        } label: {
                            Text(child.name)
                        }
                    }
                }
            }

            SubjectExtrasSection(subject: subject)

            Section("Cards") {
                if isLoading {
                    ProgressView()
                } else if failed {
                    Text("Couldn't load the cards.").foregroundStyle(.red)
                } else if cards.isEmpty {
                    Text("No cards yet.").foregroundStyle(.secondary)
                }

                ForEach(cards) { item in
                    NavigationLink {
                        KnowledgeItemDetailScreen(item: item, subjectName: subject.name) { _ in }
                    } label: {
                        Text(item.question).lineLimit(3)
                    }
                }
            }
        }
        .navigationTitle(subject.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadCards() }
        .navigationDestination(isPresented: $showsReview) { DueReviewScreen(subject: subject) }
        .mainActionControls(actionTiles)
    }

    private var actionTiles: [MainActionTile] {
        var tiles: [MainActionTile] = []

        if let closeId {
            tiles.append(MainActionTile(
                title: gapModel.requestedIds.contains(closeId) ? "Practice requested" : "Close this gap now",
                style: .prominent,
                isLoading: gapModel.isBusy,
                isDisabled: gapModel.requestedIds.contains(closeId)
            ) { Task { await gapModel.closeGap(for: closeId) } })
        }

        tiles.append(MainActionTile(
            title: "Start review",
            style: closeId == nil ? .prominent : .normal
        ) { showsReview = true })

        return tiles
    }

    private func loadCards() async {
        isLoading = true
        failed = false

        do {
            let page = try await APIClient.knowledgeOverview(subjectId: subject.id, q: nil, limit: 100)

            cards = page.items
            hasMore = page.hasMore
        } catch {
            failed = true
        }

        isLoading = false
    }
}
