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

    let writes = SerialWriteQueue()
    var needsReconcile = false

    init() {
        writes.onIdle = { [weak self] in await self?.reconcile() }
    }

    func settle() async { await writes.settle() }

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

    func load(whenIdle: Bool = false) async {
        guard !isLoading else { return }

        isLoading = true

        if !whenIdle {
            errorMessage = nil
            failureKind = nil
        }

        defer { isLoading = false }

        do {
            async let fetchedSubjects = APIClient.manageSubjects()
            async let fetchedCourses = APIClient.organizeCourses()
            let loadedSubjects = try await fetchedSubjects
            let loadedCourses = try await fetchedCourses

            if whenIdle && !writes.isIdle { return }

            subjects = loadedSubjects
            courses = loadedCourses
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            if whenIdle { return }

            errorMessage = SubjectManageError.message(for: error)
            failureKind = ProgressLoadError.from(error) ?? .other
        }
    }

    private func reconcile() async {
        guard needsReconcile else { return }

        needsReconcile = false
        await load(whenIdle: true)
    }

    func create(name: String, parentId: String?, complexityLevel: ComplexityLevel? = nil) async -> Bool {
        guard !isWorking else { return false }

        isWorking = true
        errorMessage = nil
        notice = nil
        defer { isWorking = false }

        do {
            try await APIClient.createManagedSubject(name: name, parentId: parentId, complexityLevel: complexityLevel)
            didChange = true
            await load(whenIdle: true)

            return true
        } catch {
            errorMessage = SubjectManageError.message(for: error)

            return false
        }
    }

    func rename(_ subject: SubjectManageSubject, to name: String) async -> Bool {
        errorMessage = nil
        notice = nil
        update(subject.id) { $0.with(name: name) }

        writes.enqueue { [self] in
            do {
                try await APIClient.renameSubject(id: subject.id, name: name)
                didChange = true
            } catch {
                if let current = subjects.first(where: { $0.id == subject.id }), current.name == name {
                    update(subject.id) { $0.with(name: subject.name) }
                }

                fail(error)
            }
        }

        return true
    }

    func delete(_ subject: SubjectManageSubject) async {
        errorMessage = nil
        notice = nil

        let removedCourses = courses.filter { $0.subjectId == subject.id }
        let childIds = subjects.filter { $0.parentId == subject.id }.map(\.id)

        subjects.removeAll { $0.id == subject.id }
        courses.removeAll { $0.subjectId == subject.id }
        childIds.forEach { id in update(id) { $0.with(parentId: .some(subject.parentId)) } }

        writes.enqueue { [self] in
            do {
                try await APIClient.deleteSubject(id: subject.id)
                didChange = true
                needsReconcile = true
            } catch {
                if !subjects.contains(where: { $0.id == subject.id }) { subjects.append(subject) }

                courses.append(contentsOf: removedCourses.filter { course in !courses.contains { $0.id == course.id } })
                childIds.forEach { id in
                    if subjects.first(where: { $0.id == id })?.parentId == subject.parentId {
                        update(id) { $0.with(parentId: .some(subject.id)) }
                    }
                }

                fail(error)
            }
        }
    }

    func merge(source: SubjectManageSubject, into target: SubjectManageSubject) async -> Bool {
        errorMessage = nil
        notice = nil

        let movedCourseIds = courses.filter { $0.subjectId == source.id }.map(\.id)
        let childIds = subjects.filter { $0.parentId == source.id }.map(\.id)

        subjects.removeAll { $0.id == source.id }
        courses = courses.map { movedCourseIds.contains($0.id) ? $0.with(subjectId: target.id) : $0 }
        childIds.forEach { id in update(id) { $0.with(parentId: .some(target.id)) } }

        writes.enqueue { [self] in
            do {
                let result = try await APIClient.mergeSubject(into: target.id, from: source.id)

                didChange = true
                needsReconcile = true
                notice = "Moved \(result.curriculaMoved) \(result.curriculaMoved == 1 ? "subject" : "subjects")."
            } catch {
                if !subjects.contains(where: { $0.id == source.id }) { subjects.append(source) }

                courses = courses.map { movedCourseIds.contains($0.id) ? $0.with(subjectId: source.id) : $0 }
                childIds.forEach { id in
                    if subjects.first(where: { $0.id == id })?.parentId == target.id {
                        update(id) { $0.with(parentId: .some(source.id)) }
                    }
                }

                fail(error)
            }
        }

        return true
    }

    func move(parentId: String?, from offsets: IndexSet, to destination: Int) async {
        var ids = children(of: parentId).map(\.id)
        let before = Dictionary(uniqueKeysWithValues: subjects.filter { ids.contains($0.id) }.map { ($0.id, $0.sortOrder) })

        ids.move(fromOffsets: offsets, toOffset: destination)
        errorMessage = nil
        notice = nil
        ids.enumerated().forEach { index, id in update(id) { $0.with(sortOrder: .some(index)) } }

        let sent = ids

        writes.enqueue { [self] in
            do {
                try await APIClient.reorderSubjects(parentId: parentId, orderedIds: sent)
                didChange = true
            } catch {
                sent.enumerated().forEach { index, id in
                    if subjects.first(where: { $0.id == id })?.sortOrder == index, let original = before[id] {
                        update(id) { $0.with(sortOrder: .some(original)) }
                    }
                }

                fail(error)
            }
        }
    }

    private func update(_ id: String, _ change: (SubjectManageSubject) -> SubjectManageSubject) {
        guard let index = subjects.firstIndex(where: { $0.id == id }) else { return }

        subjects[index] = change(subjects[index])
    }

    private func fail(_ error: Error) {
        errorMessage = SubjectManageError.message(for: error)
        needsReconcile = true
    }
}
