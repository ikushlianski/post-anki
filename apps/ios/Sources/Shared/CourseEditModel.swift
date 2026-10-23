import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class CourseEditModel {
    let curriculum: Curriculum
    var modules: [Module] = []
    var isLoading = false
    var isWorking = false
    var hasLoaded = false
    var didChange = false
    var errorMessage: String?
    var notice: String?

    init(curriculum: Curriculum) {
        self.curriculum = curriculum
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            modules = try await APIClient.getCurriculumDetail(curriculum.id).modules
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = CourseEditError.message(for: error)
        }
    }

    func addModule(title: String) async -> Bool {
        await run { try await APIClient.courseEditAddModule(curriculumId: curriculum.id, title: title) }
    }

    func renameModule(_ module: Module, to title: String) async -> Bool {
        await run { try await APIClient.courseEditRenameModule(id: module.id, title: title) }
    }

    func deleteModule(_ module: Module) async {
        _ = await run { try await APIClient.courseEditDeleteModule(id: module.id) }
    }

    func addTopic(to module: Module, title: String) async -> Bool {
        await run { try await APIClient.courseEditAddTopic(moduleId: module.id, title: title) }
    }

    func renameTopic(_ topic: Topic, to title: String) async -> Bool {
        await run { try await APIClient.courseEditRenameTopic(id: topic.id, title: title) }
    }

    func deleteTopic(_ topic: Topic) async {
        _ = await run { try await APIClient.courseEditDeleteTopic(id: topic.id) }
    }

    func moveModules(from offsets: IndexSet, to destination: Int) async {
        var ids = modules.map(\.id)

        ids.move(fromOffsets: offsets, toOffset: destination)

        modules = ids.compactMap { id in modules.first { $0.id == id } }

        await reloadOnFailure { try await APIClient.courseEditReorderModules(curriculumId: curriculum.id, orderedIds: ids) }
    }

    func moveTopics(in module: Module, from offsets: IndexSet, to destination: Int) async {
        var ids = module.topics.map(\.id)

        ids.move(fromOffsets: offsets, toOffset: destination)

        await reloadOnFailure { try await APIClient.courseEditReorderTopics(moduleId: module.id, orderedIds: ids) }
    }

    func comment(on module: Module, text: String) async -> Bool {
        await comment { try await APIClient.courseEditCommentModule(id: module.id, comment: text) }
    }

    func comment(on topic: Topic, text: String) async -> Bool {
        await comment { try await APIClient.courseEditCommentTopic(id: topic.id, comment: text) }
    }

    private func comment(_ work: () async throws -> Void) async -> Bool {
        guard !isWorking else { return false }

        isWorking = true
        errorMessage = nil
        defer { isWorking = false }

        do {
            try await work()
            notice = "Comment saved."

            return true
        } catch {
            errorMessage = CourseEditError.message(for: error)

            return false
        }
    }

    private func reloadOnFailure(_ work: () async throws -> Void) async {
        if await run(work) { return }

        let message = errorMessage

        await load()
        errorMessage = message
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
            errorMessage = CourseEditError.message(for: error)

            return false
        }
    }
}
