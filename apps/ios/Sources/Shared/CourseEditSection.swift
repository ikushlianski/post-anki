import PostAnkiAPI
import SwiftUI

struct CourseEditSection: View {
    let curriculum: Curriculum
    let onClose: () -> Void

    var body: some View {
        Section {
            NavigationLink {
                CourseEditScreen(curriculum: curriculum, onClose: onClose)
            } label: {
                Label("Edit course structure", systemImage: "pencil")
            }
        }
    }
}
