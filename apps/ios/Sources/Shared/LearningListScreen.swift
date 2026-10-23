import PostAnkiAPI
import SwiftUI

struct LearningListScreen: View {
    @State private var model = LearningListModel()
    @State private var showsCapture = false

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(.red)
                    Button("Try again") { Task { await model.load() } }
                }
            } else if model.isLoading && !model.hasLoaded {
                ProgressView()
            } else if model.hasLoaded && model.items.isEmpty {
                Text("Nothing saved yet. Tap + to add a link.")
                    .foregroundStyle(.secondary)
            }

            group("Needs your decision", model.awaiting)
            group("Parked", model.parked)
            group("Working on it", model.working)
            group("Done", model.done)
        }
        .navigationTitle("Learning list")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showsCapture = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Save a link")
                .help("Save a link")
            }
        }
        .sheet(isPresented: $showsCapture) {
            CaptureLearningItemSheet(subjects: model.subjects) { item in
                model.replace(item)
                Task { await model.load() }
            }
        }
        .refreshable { await model.load() }
        .task {
            async let items: Void = model.load()
            async let subjects: Void = model.loadSubjects()
            await items
            await subjects
        }
    }

    @ViewBuilder
    private func group(_ title: String, _ items: [LearningListItem]) -> some View {
        if !items.isEmpty {
            Section(title) {
                ForEach(items) { item in
                    NavigationLink {
                        LearningListItemScreen(item: item, subjects: model.subjects) { model.replace($0) }
                    } label: {
                        LearningListRow(item: item)
                    }
                }
            }
        }
    }
}

struct LearningListRow: View {
    let item: LearningListItem

    var body: some View {
        ZoomHStack(spacing: 12) {
            Image(systemName: item.kind == "video" ? "play.rectangle" : "doc.text")
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)

            ZoomVStack(alignment: .leading, spacing: 2) {
                Text(item.displayTitle).lineLimit(2)

                Text(item.statusCaption)
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
