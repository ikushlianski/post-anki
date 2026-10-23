import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class LearningPathsModel {
    var paths: [LearningPath] = []
    var templates: [RoleTemplate] = []
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?
    var startMessage: String?
    var isStarting = false

    var activePaths: [LearningPath] { sorted(paths.filter { $0.status == "active" }) }
    var otherPaths: [LearningPath] { sorted(paths.filter { $0.status != "active" }) }

    private func sorted(_ list: [LearningPath]) -> [LearningPath] {
        list.sorted { $0.createdAt > $1.createdAt }
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        failureKind = nil
        defer { isLoading = false }

        do {
            paths = try await APIClient.listLearningPaths()
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = LearningPathError.message(for: error)
            failureKind = ProgressLoadError.from(error)
        }
    }

    func loadTemplates() async {
        startMessage = nil

        do {
            templates = try await APIClient.listRoleTemplates()
        } catch {
            startMessage = LearningPathError.message(for: error)
        }
    }

    func start(_ template: RoleTemplate) async -> Bool {
        guard !isStarting else { return false }

        isStarting = true
        startMessage = nil
        defer { isStarting = false }

        do {
            let path = try await APIClient.startLearningPath(roleTemplateId: template.id)

            paths.insert(path, at: 0)

            return true
        } catch {
            startMessage = LearningPathError.message(for: error)

            return false
        }
    }
}

@Observable
@MainActor
final class LearningPathDetailModel {
    let pathId: String
    var detail: LearningPathDetail?
    var templateNames: [String: String] = [:]
    var isLoading = false
    var isAbandoning = false
    var errorMessage: String?

    init(pathId: String) {
        self.pathId = pathId
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            async let fetched = APIClient.getLearningPath(id: pathId)
            async let templates = APIClient.listRoleTemplates()

            detail = try await fetched

            let all = (try? await templates) ?? []

            for target in all.flatMap(\.targets) { templateNames[target.domainNodeId] = target.name }
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = LearningPathError.message(for: error)
        }
    }

    func abandon() async {
        guard !isAbandoning else { return }

        isAbandoning = true
        errorMessage = nil
        defer { isAbandoning = false }

        do {
            _ = try await APIClient.abandonLearningPath(id: pathId)
            isLoading = false
            await load()
        } catch {
            errorMessage = LearningPathError.message(for: error)
        }
    }
}
