import SwiftUI

struct SettingsToolsSection: View {
    var body: some View {
        Section("Tools") {
            NavigationLink {
                DomainMapScreen()
            } label: {
                Label("Knowledge maps", systemImage: "map")
            }

            NavigationLink {
                CourseRefocusScreen()
            } label: {
                Label("Refocus suggestions", systemImage: "scope")
            }

            NavigationLink {
                DuplicateReviewScreen()
            } label: {
                Label("Duplicates", systemImage: "square.on.square")
            }

            NavigationLink {
                AdminScreen()
            } label: {
                Label("Admin", systemImage: "wrench.and.screwdriver")
            }
        }
    }
}
