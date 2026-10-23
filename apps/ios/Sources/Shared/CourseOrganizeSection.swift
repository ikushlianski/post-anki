import SwiftUI

struct CourseOrganizeSection: View {
    let onChange: () -> Void

    var body: some View {
        Section("Organise") {
            NavigationLink {
                SubjectManageScreen(onChange: onChange)
            } label: {
                Label("Manage subjects", systemImage: "folder.badge.gearshape")
            }

            NavigationLink {
                CourseBuildCreateScreen()
            } label: {
                Label("New course", systemImage: "plus.rectangle.on.folder")
            }

            NavigationLink {
                CourseBuildListScreen()
            } label: {
                Label("Courses being built", systemImage: "hammer")
            }
        }
    }
}
