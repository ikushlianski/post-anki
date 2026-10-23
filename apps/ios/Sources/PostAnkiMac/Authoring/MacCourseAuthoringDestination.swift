import PostAnkiAPI
import SwiftUI

enum MacCourseAuthoringDestination: Hashable {
    case edit(Curriculum)
    case manageSubjects
    case newCourse
    case builds
}

struct MacCourseAuthoringDestinationView: View {
    let destination: MacCourseAuthoringDestination
    let onChange: () -> Void

    var body: some View {
        switch destination {
        case .edit(let curriculum): CourseEditScreen(curriculum: curriculum, onClose: onChange)
        case .manageSubjects: SubjectManageScreen(onChange: onChange)
        case .newCourse: CourseBuildCreateScreen()
        case .builds: MacCourseBuildsView()
        }
    }
}
