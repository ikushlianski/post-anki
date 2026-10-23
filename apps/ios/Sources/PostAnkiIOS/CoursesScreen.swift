import PostAnkiAPI
import SwiftUI

struct CoursesScreen: View {
    @State private var model = CoursesScreenModel()

    var body: some View {
        NavigationStack {
            List {
                ForEach(model.subjects) { subject in
                    Section(subject.name) {
                        ForEach(model.curricula(for: subject.id)) { curriculum in
                            NavigationLink(value: curriculum) {
                                Text(curriculum.name)
                            }
                        }
                    }
                }
                CourseOrganizeSection(onChange: { Task { await model.load() } })

                if let errorMessage = model.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }
            .navigationTitle("Courses")
            .refreshable { await model.load() }
            .task { await model.load() }
            .navigationDestination(for: Curriculum.self) { curriculum in
                CurriculumDetailScreen(curriculum: curriculum)
            }
        }
    }
}
