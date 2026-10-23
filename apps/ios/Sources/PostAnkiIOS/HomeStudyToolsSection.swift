import SwiftUI

struct HomeStudyToolsSection: View {
    var body: some View {
        Section("Study tools") {
            NavigationLink {
                AskScreen()
            } label: {
                Label("Ask your cards", systemImage: "text.bubble")
            }

            NavigationLink {
                NotesSearchScreen()
            } label: {
                Label("Search notes", systemImage: "magnifyingglass")
            }

            NavigationLink {
                OpenQuestionsScreen()
            } label: {
                Label("Open questions", systemImage: "questionmark.circle")
            }
        }
    }
}
