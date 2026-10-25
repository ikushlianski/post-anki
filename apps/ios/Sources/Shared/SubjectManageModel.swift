import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class SubjectManageModel {
    var subjects: [SubjectManageSubject] = []
    var courses: [SubjectManageCourse] = []
    var isLoading = false
    var isWorking = false
    var hasLoaded = false
    var didChange = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?
    var notice: String?

    var parents: [SubjectManageSubject] {
        subjects.filter { subject in
            subjects.contains { $0.parentId == subject.id }
        }
    }

    func children(of parentId: String?) -> [SubjectManageSubject] {
        subjects
            .filter { $0.parentId == parentId }
            .sorted {
                let left = $0.sortOrder ?? Int.max
                let right = $1.sortOrder ?? Int.max

                if left != right { return left < right }

                return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }
    }

    func name(of id: String?) -> String {
        subjects.first { $0.id == id }?.name ?? ""
    }

    func courseCount(of subjectId: String) -> Int {
        courses.filter { $0.subjectId == subjectId }.count
    }

    func mergeCandidates(for subject: SubjectManageSubject) -> [SubjectManageSubject] {
        subjects.filter { $0.id != subject.id && $0.kind == subject.kind }
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        failureKind = nil
        defer { isLoading = false }

        do {
            async let fetchedSubjects = APIClient.manageSubjects()
            async let fetchedCourses = APIClient.organizeCourses()

            subjects = try await fetchedSubjects
            courses = try await fetchedCourses
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = SubjectManageError.message(for: error)
            failureKind = ProgressLoadError.from(error) ?? .other
        }
    }

    func create(name: String, parentId: String?) async -> Bool {
        await run { try await APIClient.createManagedSubject(name: name, parentId: parentId) }
    }

    func rename(_ subject: SubjectManageSubject, to name: String) async -> Bool {
        await run { try await APIClient.renameSubject(id: subject.id, name: name) }
    }

    func delete(_ subject: SubjectManageSubject) async {
        _ = await run { try await APIClient.deleteSubject(id: subject.id) }
    }

    func merge(source: SubjectManageSubject, into target: SubjectManageSubject) async -> Bool {
        let moved = courseCount(of: source.id)

        let succeeded = await run { _ = try await APIClient.mergeSubject(into: target.id, from: source.id) }

        if succeeded {
            notice = "Moved \(moved) \(moved == 1 ? "subject" : "subjects")."
        }

        return succeeded
    }

    func move(parentId: String?, from offsets: IndexSet, to destination: Int) async {
        var ids = children(of: parentId).map(\.id)

        ids.move(fromOffsets: offsets, toOffset: destination)

        let succeeded = await run { try await APIClient.reorderSubjects(parentId: parentId, orderedIds: ids) }

        if !succeeded {
            let message = errorMessage

            await load()
            errorMessage = message
        }
    }

    private func run(_ work: () async throws -> Void) async -> Bool {
        guard !isWorking else { return false }

        isWorking = true
        errorMessage = nil
        notice = nil
        defer { isWorking = false }

        do {
            try await work()
            didChange = true
            await load()

            return true
        } catch {
            errorMessage = SubjectManageError.message(for: error)

            return false
        }
    }
}
