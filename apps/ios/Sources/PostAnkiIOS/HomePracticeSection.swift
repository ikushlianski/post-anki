import SwiftUI

struct HomePracticeSection: View {
    var body: some View {
        Section("Learn more") {
            NavigationLink {
                LearningListScreen()
            } label: {
                Label("Learning list", systemImage: "tray.full")
            }

            NavigationLink {
                LearningPathsScreen()
            } label: {
                Label("Learning paths", systemImage: "map")
            }

            NavigationLink {
                DecideScreen()
            } label: {
                Label("Challenge my thinking", systemImage: "scalemass")
            }

            NavigationLink {
                PracticeSubjectsScreen()
            } label: {
                Label("Language practice", systemImage: "character.bubble")
            }

            NavigationLink {
                TagsScreen()
            } label: {
                Label("Tags", systemImage: "tag")
            }
        }
    }
}
