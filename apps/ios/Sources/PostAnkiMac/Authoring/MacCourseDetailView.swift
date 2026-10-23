import PostAnkiAPI
import SwiftUI

struct MacCourseDetailView: View {
    let curriculum: Curriculum
    let onChange: () -> Void

    @State private var reloadToken = 0
    @State private var destination: MacCourseAuthoringDestination?

    var body: some View {
        CurriculumDetailScreen(curriculum: curriculum)
            .id(reloadToken)
            .toolbar {
                ToolbarItem {
                    Button { destination = .edit(curriculum) } label: {
                        Label("Edit course", systemImage: "pencil")
                    }
                }

                ToolbarItem {
                    Menu {
                        Button("Manage subjects", systemImage: "folder.badge.gearshape") {
                            destination = .manageSubjects
                        }
                        Button("New course", systemImage: "plus.rectangle.on.folder") {
                            destination = .newCourse
                        }
                        Button("Course builds", systemImage: "hammer") { destination = .builds }
                    } label: {
                        Label("Organize", systemImage: "folder.badge.gearshape")
                    }
                }
            }
            .navigationDestination(item: $destination) { destination in
                MacCourseAuthoringDestinationView(destination: destination) {
                    reloadToken += 1
                    onChange()
                }
            }
    }
}
