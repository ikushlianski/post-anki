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

    let writes = SerialWriteQueue()
    var needsReconcile = false

    init(subject: SubjectManageSubject) {
        self.subject = subject
        writes.onIdle = { [weak self] in await self?.reconcile() }
    }

    func settle() async { await writes.settle() }

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

    func load(whenIdle: Bool = false) async {
        guard !isLoading else { return }

        isLoading = true

        if !whenIdle { errorMessage = nil }

        defer { isLoading = false }

        do {
            async let fetchedCategories = APIClient.subjectCategories(subjectId: subject.id)
            async let fetchedCourses = APIClient.organizeCourses()
            let loadedCategories = try await fetchedCategories
            let loadedCourses = try await fetchedCourses.filter { $0.subjectId == subject.id }

            if whenIdle && !writes.isIdle { return }

            categories = loadedCategories
            courses = loadedCourses
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            if whenIdle { return }

            errorMessage = SubjectManageError.message(for: error)
        }
    }

    private func reconcile() async {
        guard needsReconcile else { return }

        needsReconcile = false
        await load(whenIdle: true)
    }

    func create(name: String, parentId: String?) async -> Bool {
        guard !isWorking else { return false }

        isWorking = true
        errorMessage = nil
        defer { isWorking = false }

        do {
            try await APIClient.createSubjectCategory(subjectId: subject.id, name: name, parentId: parentId)
            await load(whenIdle: true)

            return true
        } catch {
            errorMessage = SubjectManageError.message(for: error)

            return false
        }
    }

    func rename(_ category: SubjectCategory, to name: String) async -> Bool {
        errorMessage = nil
        updateCategory(category.id) { $0.with(name: name) }

        writes.enqueue { [self] in
            do {
                try await APIClient.renameSubjectCategory(id: category.id, name: name)
            } catch {
                if categories.first(where: { $0.id == category.id })?.name == name {
                    updateCategory(category.id) { $0.with(name: category.name) }
                }

                fail(error)
            }
        }

        return true
    }

    func move(_ category: SubjectCategory, into parentId: String?) async {
        errorMessage = nil
        updateCategory(category.id) { $0.with(parentId: .some(parentId)) }

        writes.enqueue { [self] in
            do {
                try await APIClient.moveSubjectCategory(id: category.id, parentId: parentId)
            } catch {
                if categories.first(where: { $0.id == category.id })?.parentId == parentId {
                    updateCategory(category.id) { $0.with(parentId: .some(category.parentId)) }
                }

                fail(error)
            }
        }
    }

    func put(_ course: SubjectManageCourse, in categoryId: String?) async {
        errorMessage = nil
        updateCourse(course.id) { $0.with(categoryId: .some(categoryId)) }

        writes.enqueue { [self] in
            do {
                try await APIClient.setCourseCategory(courseId: course.id, subjectId: subject.id, categoryId: categoryId)
            } catch {
                if courses.first(where: { $0.id == course.id })?.categoryId == categoryId {
                    updateCourse(course.id) { $0.with(categoryId: .some(course.categoryId)) }
                }

                fail(error)
            }
        }
    }

    private func updateCategory(_ id: String, _ change: (SubjectCategory) -> SubjectCategory) {
        guard let index = categories.firstIndex(where: { $0.id == id }) else { return }

        categories[index] = change(categories[index])
    }

    private func updateCourse(_ id: String, _ change: (SubjectManageCourse) -> SubjectManageCourse) {
        guard let index = courses.firstIndex(where: { $0.id == id }) else { return }

        courses[index] = change(courses[index])
    }

    private func fail(_ error: Error) {
        errorMessage = SubjectManageError.message(for: error)
        needsReconcile = true
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
}
