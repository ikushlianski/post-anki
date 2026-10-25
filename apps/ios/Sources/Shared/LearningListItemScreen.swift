import PostAnkiAPI
import SwiftUI

struct LearningListItemScreen: View {
    let subjects: [Subject]
    let onChange: (LearningListItem) -> Void

    @State private var model: LearningListItemModel
    @State private var sortSubjectId = ""

    init(item: LearningListItem, subjects: [Subject], onChange: @escaping (LearningListItem) -> Void) {
        self.subjects = subjects
        self.onChange = onChange
        _model = State(initialValue: LearningListItemModel(item: item))
    }

    var body: some View {
        List {
            Section {
                Text(model.item.displayTitle).zoomFont(.headline)

                if let url = model.item.url {
                    Text(url)
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                Text(model.item.statusCaption).foregroundStyle(.secondary)
            }

            if let recommendation = model.item.recommendation {
                recommendationSection(recommendation)
            }

            actionsSection

            if let message = model.message {
                Section { Text(message).foregroundStyle(.red) }
            }

            if model.isWorking {
                Section { ProgressView() }
            }
        }
        .navigationTitle("Link")
        .inlineNavigationTitle()
        .navigationDestination(item: $model.curriculum) { CurriculumDetailScreen(curriculum: $0) }
        .onChange(of: model.item) { _, item in onChange(item) }
    }

    private func recommendationSection(_ recommendation: LearningListRecommendation) -> some View {
        Section("Suggestion") {
            Text(model.destinationText).zoomFont(.headline)

            if let parts = recommendation.partCount, parts > 1 {
                Text("\(parts) parts")
                    .foregroundStyle(.secondary)
            }

            ForEach(recommendation.reasons, id: \.self) { reason in
                Text("\u{2022} \(reason)")
            }
        }
    }

    @ViewBuilder
    private var actionsSection: some View {
        let item = model.item

        Section {
            if item.isAwaitingDecision {
                Button("Approve") { Task { await model.decide(approve: true) } }
                Button("Decline", role: .destructive) { Task { await model.decide(approve: false) } }
            }

            if item.status == "parked" {
                Button("Make a short subject") { Task { await model.choose(destination: "mini_course") } }
                Button("Add to an existing area") { Task { await model.choose(destination: "fold_in") } }
            }

            if item.status == "captured", item.url != nil, !subjects.isEmpty {
                Picker("Subject", selection: $sortSubjectId) {
                    ForEach(subjects) { Text($0.name).tag($0.id) }
                }

                Button("Sort it now") {
                    Task { await model.classify(subjectId: sortSubjectId) }
                }
                .disabled(sortSubjectId.isEmpty)
            }

            if model.openableCurriculumId != nil {
                Button("Open subject") { Task { await model.openCourse() } }
            }
        }
        .disabled(model.isWorking)
        .onAppear {
            if sortSubjectId.isEmpty, let first = subjects.first { sortSubjectId = first.id }
        }
    }
}
