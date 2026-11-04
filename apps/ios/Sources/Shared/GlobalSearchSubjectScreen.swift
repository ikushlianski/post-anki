import PostAnkiAPI
import SwiftUI

struct GlobalSearchSubjectScreen: View {
    let subject: GlobalSearchItem
    let model: GlobalSearchModel

    @State private var courses: [Curriculum] = []
    @State private var hasLoaded = false
    @State private var errorMessage: String?

    var body: some View {
        List {
            if let errorMessage {
                VStack(alignment: .leading, spacing: 8) {
                    Text(errorMessage).foregroundStyle(.secondary)
                    Button("Try again") { Task { await load() } }
                }
            } else if !hasLoaded {
                ProgressView()
            } else if courses.isEmpty {
                Text("No courses in this subject yet.").foregroundStyle(.secondary)
            }

            ForEach(courses) { course in
                NavigationLink(course.name) { CurriculumDetailScreen(curriculum: course) }
            }
        }
        .navigationTitle(subject.label)
        .inlineNavigationTitle()
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            courses = try await model.courses(of: subject.id)
            errorMessage = nil
        } catch {
            guard ProgressLoadError.from(error) != nil else { return }

            errorMessage = StudyToolsError.message(for: error)
        }

        hasLoaded = true
    }
}
