import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class DomainMapModel {
    var subjects: [Subject] = []
    var subjectId: String?
    var tree: [DomainNodeItem] = []
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?

    var flat: [DomainNodeItem] { Self.flatten(tree) }

    var nodeNames: [String: String] {
        Dictionary(flat.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
    }

    static func flatten(_ nodes: [DomainNodeItem]) -> [DomainNodeItem] {
        nodes.flatMap { [$0] + flatten($0.children) }
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        defer { isLoading = false }

        var requested: String?

        repeat {
            errorMessage = nil
            failureKind = nil

            guard await loadOnce(requested: &requested) else { return }
        } while requested != subjectId
    }

    private func loadOnce(requested: inout String?) async -> Bool {
        do {
            if subjects.isEmpty {
                subjects = try await APIClient.listSubjects()
            }

            if subjectId == nil {
                subjectId = subjects.first?.id
            }

            requested = subjectId

            guard let id = subjectId else {
                tree = []
                hasLoaded = true

                return true
            }

            let fetched: [DomainNodeItem]

            do {
                fetched = try await APIClient.domainMap(subjectId: id)
            } catch APIError.badStatus(404, _) {
                fetched = []
            }

            if id == subjectId {
                tree = fetched
                hasLoaded = true
            }

            return true
        } catch where ProgressLoadError.from(error) == nil {
            return false
        } catch {
            errorMessage = DomainMapError.message(for: error)
            failureKind = ProgressLoadError.from(error) ?? .other

            return false
        }
    }

    func select(_ id: String?) async {
        subjectId = id
        tree = []
        await load()
    }
}

@Observable
@MainActor
final class DomainNodeModel {
    var node: DomainNodeItem
    var depth: String?
    var errorMessage: String?
    var notice: String?
    var isBusy = false
    private var savedDepth: String?

    init(node: DomainNodeItem) {
        self.node = node
        depth = node.targetDepth
        savedDepth = node.targetDepth
    }

    func saveDepth(_ newDepth: String?) async {
        guard newDepth != savedDepth else { return }

        errorMessage = nil
        isBusy = true
        defer { isBusy = false }

        do {
            try await APIClient.setDomainNodeDepth(id: node.id, depth: newDepth)
            savedDepth = newDepth
            notice = "Saved."
        } catch {
            depth = savedDepth
            errorMessage = DomainMapError.message(for: error)
        }
    }

    func merge(_ source: DomainNodeItem) async -> Bool {
        errorMessage = nil
        notice = nil
        isBusy = true
        defer { isBusy = false }

        do {
            let result = try await APIClient.mergeDomainNodes(targetId: node.id, sourceId: source.id)

            notice = "Moved \(result.curriculaMoved) subjects and \(result.childNodesMoved) sub-areas."

            return true
        } catch {
            errorMessage = DomainMapError.message(for: error)

            return false
        }
    }
}
