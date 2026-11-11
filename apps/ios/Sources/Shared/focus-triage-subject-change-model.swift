import Observation
import PostAnkiAPI

@Observable
@MainActor
final class FocusTriageSubjectChangeModel {
    let bitId: String
    var subjects: [Subject] = []
    var isBusy = false
    var message: String?

    init(bitId: String) {
        self.bitId = bitId
    }

    var tree: [SubjectTreeNode] { SubjectTreePath.tree(from: subjects) }

    var parentChoices: [(id: String, label: String)] { SubjectParentChoices.list(from: tree) }

    func label(for id: String) -> String {
        SubjectTreePath.names(to: id, in: tree)?.joined(separator: " › ") ?? ""
    }

    func load() async {
        guard subjects.isEmpty else { return }

        do {
            subjects = try await APIClient.listSubjects()
        } catch {
            message = "Couldn't load subjects."
        }
    }

    func assign(subjectId: String) async -> String? {
        guard !isBusy else { return nil }

        isBusy = true
        message = nil
        defer { isBusy = false }

        do {
            let result = try await APIClient.moveKnowledgeBits(ids: [bitId], subjectId: subjectId)

            guard result.moved.contains(bitId) else {
                message = "Couldn't change the subject. Try again."

                return nil
            }

            return label(for: subjectId)
        } catch {
            message = "Couldn't change the subject. Try again."

            return nil
        }
    }

    func createAndAssign(name: String, parentId: String?, complexityLevel: ComplexityLevel? = nil) async -> String? {
        guard !isBusy else { return nil }

        isBusy = true
        message = nil

        do {
            let created = try await APIClient.createSubject(name: name, parentId: parentId, complexityLevel: complexityLevel)

            subjects.append(created)
            isBusy = false

            return await assign(subjectId: created.id)
        } catch {
            isBusy = false
            message = "Couldn't create the subject. Try again."

            return nil
        }
    }
}
