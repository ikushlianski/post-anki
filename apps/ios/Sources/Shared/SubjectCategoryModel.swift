import PostAnkiAPI
import SwiftUI

struct SubjectCategoryRow: Identifiable, Hashable {
    let category: SubjectCategory
    let depth: Int

    var id: String { category.id }
}

@Observable
@MainActor
final class SubjectCategoryModel {
    let subject: SubjectManageSubject
    var categories: [SubjectCategory] = []
    var courses: [SubjectManageCourse] = []
    var isLoading = false
    var isWorking = false
    var hasLoaded = false
    var errorMessage: String?

    init(subject: SubjectManageSubject) {
        self.subject = subject
    }

    var rows: [SubjectCategoryRow] {
        flatten(parentId: nil, depth: 0, visited: [])
    }

    var uncategorised: [SubjectManageCourse] {
        courses.filter { course in
            guard let categoryId = course.categoryId else { return true }

            return !categories.contains { $0.id == categoryId }
        }
    }

    func courses(in categoryId: String) -> [SubjectManageCourse] {
        courses.filter { $0.categoryId == categoryId }
    }

    func moveCandidates(for category: SubjectCategory) -> [SubjectCategory] {
        categories.filter { $0.id != category.id }
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            async let fetchedCategories = APIClient.subjectCategories(subjectId: subject.id)
            async let fetchedCourses = APIClient.organizeCourses()

            categories = try await fetchedCategories
            courses = try await fetchedCourses.filter { $0.subjectId == subject.id }
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = SubjectManageError.message(for: error)
        }
    }

    func create(name: String, parentId: String?) async -> Bool {
        await run { try await APIClient.createSubjectCategory(subjectId: subject.id, name: name, parentId: parentId) }
    }

    func rename(_ category: SubjectCategory, to name: String) async -> Bool {
        await run { try await APIClient.renameSubjectCategory(id: category.id, name: name) }
    }

    func move(_ category: SubjectCategory, into parentId: String?) async {
        _ = await run { try await APIClient.moveSubjectCategory(id: category.id, parentId: parentId) }
    }

    func put(_ course: SubjectManageCourse, in categoryId: String?) async {
        _ = await run {
            try await APIClient.setCourseCategory(courseId: course.id, subjectId: subject.id, categoryId: categoryId)
        }
    }

    private func flatten(parentId: String?, depth: Int, visited: Set<String>) -> [SubjectCategoryRow] {
        categories
            .filter { $0.parentId == parentId && !visited.contains($0.id) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            .flatMap { category in
                [SubjectCategoryRow(category: category, depth: depth)]
                    + flatten(parentId: category.id, depth: depth + 1, visited: visited.union([category.id]))
            }
    }

    private func run(_ work: () async throws -> Void) async -> Bool {
        guard !isWorking else { return false }

        isWorking = true
        errorMessage = nil
        defer { isWorking = false }

        do {
            try await work()
            await load()

            return true
        } catch {
            errorMessage = SubjectManageError.message(for: error)

            return false
        }
    }
}
