import PostAnkiAPI
import SwiftUI

struct GlobalSearchSubjectScreen: View {
    let subject: GlobalSearchItem
    let model: GlobalSearchModel

    @State private var courses: [Curriculum] = []
    @State private var hasLoaded = false

    var body: some View {
        List {
            if !hasLoaded {
                ProgressView()
            } else if courses.isEmpty {
                Text("No courses in this subject.").foregroundStyle(.secondary)
            }

            ForEach(courses) { course in
                NavigationLink(course.name) { CurriculumDetailScreen(curriculum: course) }
            }
        }
        .navigationTitle(subject.label)
        .inlineNavigationTitle()
        .task {
            courses = await model.courses(of: subject.id)
            hasLoaded = true
        }
    }
}
