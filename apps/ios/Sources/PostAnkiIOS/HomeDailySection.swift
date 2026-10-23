import SwiftUI

struct HomeDailySection: View {
    @State private var model = DailyPushCardModel()

    var body: some View {
        Section {
            NavigationLink {
                DailyPushScreen()
            } label: {
                card
            }
            .task { await model.load() }
        }

        Section("Find and import") {
            NavigationLink {
                GlobalSearchScreen()
            } label: {
                Label("Search", systemImage: "magnifyingglass")
            }

            NavigationLink {
                SourceLibraryScreen()
            } label: {
                Label("Source library", systemImage: "books.vertical")
            }

            NavigationLink {
                ContentInboxScreen()
            } label: {
                Label("Content inbox", systemImage: "tray")
            }

            NavigationLink {
                NotionImportScreen()
            } label: {
                Label("Import from Notion", systemImage: "square.and.arrow.down.on.square")
            }
        }
    }

    @ViewBuilder
    private var card: some View {
        if let push = model.push {
            VStack(alignment: .leading, spacing: 4) {
                Text("Start your day").font(.headline)
                Text(push.topicTitle)
                Text("\(push.curriculumName) · \(push.reasonLabel)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        } else if let errorMessage = model.errorMessage {
            VStack(alignment: .leading, spacing: 4) {
                Text("Start your day").font(.headline)
                Text(errorMessage).font(.caption).foregroundStyle(.red)
                Button("Retry") { Task { await model.load() } }
                    .buttonStyle(.borderless)
            }
        } else if model.hasLoaded {
            VStack(alignment: .leading, spacing: 4) {
                Text("Start your day").font(.headline)
                Text("Nothing picked for today. You're up to date.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("See due queue").font(.caption)
            }
        } else {
            HStack {
                Text("Start your day").font(.headline)
                Spacer()
                ProgressView()
            }
        }
    }
}
