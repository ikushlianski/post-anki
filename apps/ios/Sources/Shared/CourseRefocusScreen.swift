import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class CourseRefocusModel {
    var items: [CourseRefocusSuggestion] = []
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var notice: String?
    var failureKind: ProgressLoadError?

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        failureKind = nil
        defer { isLoading = false }

        do {
            items = try await APIClient.courseRefocusSuggestions().filter { $0.dismissedAt == nil }
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = DomainMapError.message(for: error)
            failureKind = ProgressLoadError.from(error)
        }
    }

    func dismiss(_ item: CourseRefocusSuggestion) async {
        notice = nil

        do {
            try await APIClient.dismissCourseRefocus(curriculumId: item.curriculumId, reason: item.reason)
        } catch {
            notice = DomainMapError.message(for: error)
        }

        await load()
    }

    func course(for item: CourseRefocusSuggestion) async -> Curriculum? {
        let course = try? await APIClient.listCurricula().first { $0.id == item.curriculumId }

        if course == nil {
            notice = "Couldn't open this subject."
        }

        return course
    }
}

struct CourseRefocusScreen: View {
    @State private var model = CourseRefocusModel()
    @State private var opened: Curriculum?

    var body: some View {
        List {
            if let notice = model.notice {
                Text(notice).foregroundStyle(.secondary)
            }

            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
                Button("Try again") { Task { await model.load() } }
            } else if model.isLoading && !model.hasLoaded {
                ProgressView()
            } else if model.hasLoaded && model.items.isEmpty {
                Text("Nothing to refocus right now.").foregroundStyle(.secondary)
            }

            ForEach(model.items) { item in
                ZoomVStack(alignment: .leading, spacing: 6) {
                    Text("\(item.courseName) in \(item.subjectName)").zoomFont(.headline)
                    Text(item.reasonText).zoomFont(.caption).foregroundStyle(.secondary)

                    HStack {
                        Button("Open subject") {
                            Task { opened = await model.course(for: item) }
                        }
                        .buttonStyle(.borderedProminent)

                        Button("Dismiss") { Task { await model.dismiss(item) } }
                            .buttonStyle(.bordered)
                    }
                }
            }
        }
        .navigationTitle("Refocus suggestions")
        .navigationDestination(item: $opened) { CurriculumDetailScreen(curriculum: $0) }
        .refreshable { await model.load() }
        .task { await model.load() }
    }
}
