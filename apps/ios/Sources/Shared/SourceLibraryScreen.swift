import PostAnkiAPI
import SwiftUI

struct SourceLibraryScreen: View {
    @State private var model = SourceLibraryModel()
    @State private var deleting: SourceLibraryItem?

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
                Button("Try again") { Task { await model.load() } }
            } else if model.isLoading && !model.hasLoaded {
                ProgressView()
            } else if model.hasLoaded && model.sources.isEmpty {
                Text("No sources yet.").foregroundStyle(.secondary)
            }

            ForEach(model.groups) { group in
                Section(group.title) {
                    ForEach(group.sources) { source in
                        row(source)
                    }
                }
            }
        }
        .navigationTitle("Source library")
        .inlineNavigationTitle()
        .searchable(text: $model.query)
        .confirmationDialog(
            deleting.map { "Delete this source from \($0.curriculumName)?" } ?? "Delete this source?",
            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                if let source = deleting { Task { await model.delete(source) } }

                deleting = nil
            }
            Button("Cancel", role: .cancel) { deleting = nil }
        } message: {
            Text("Lectures and research for that course will no longer use it.")
        }
        .refreshable { await model.load() }
        .task { await model.load() }
    }

    private func row(_ source: SourceLibraryItem) -> some View {
        let isBusy = model.busyIds.contains(source.id)

        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(source.displayTitle).lineLimit(2)

                Spacer()

                if isBusy { ProgressView() }
            }

            HStack {
                Text(source.kindLabel)
                Text(model.badge(for: source))
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if let message = model.rowMessages[source.id] {
                Text(message).font(.caption).foregroundStyle(.orange)
            }
        }
        .swipeActions {
            if !isBusy {
                Button("Delete", role: .destructive) { deleting = source }

                if source.isLink {
                    Button("Re-fetch") { Task { await model.refetch(source) } }
                        .tint(.blue)
                }
            }
        }
    }
}
