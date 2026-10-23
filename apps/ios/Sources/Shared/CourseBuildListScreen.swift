import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class CourseBuildListModel {
    var courses: [CourseBuildCourse] = []
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        failureKind = nil
        defer { isLoading = false }

        do {
            courses = try await APIClient.courseBuildList().filter { $0.status != "confirmed" }
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = CourseBuildError.message(for: error)
            failureKind = ProgressLoadError.from(error)
        }
    }
}

struct CourseBuildListScreen: View {
    @State private var model = CourseBuildListModel()

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
                Button("Try again") { Task { await model.load() } }
            } else if model.isLoading && !model.hasLoaded {
                ProgressView()
            } else if model.hasLoaded && model.courses.isEmpty {
                Text("No courses are being built.").foregroundStyle(.secondary)
            }

            ForEach(model.courses) { course in
                NavigationLink {
                    CourseBuildScreen(courseId: course.id, title: course.name)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(course.name)
                        Text(course.statusLabel).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Courses being built")
        .refreshable { await model.load() }
        .task { await model.load() }
    }
}
