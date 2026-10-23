import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class TagsModel {
    var tags: [Tag] = []
    var mastery: [String: TagMastery] = [:]
    var query = ""
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?
    var notice: String?

    var filtered: [Tag] {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let sorted = tags.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

        return text.isEmpty ? sorted : sorted.filter { $0.name.localizedCaseInsensitiveContains(text) }
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        failureKind = nil
        defer { isLoading = false }

        do {
            async let fetchedTags = APIClient.listTags()
            async let fetchedMastery = APIClient.tagMastery()

            tags = try await fetchedTags
            mastery = Self.index(try await fetchedMastery)
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = TagError.message(for: error)
            failureKind = ProgressLoadError.from(error) ?? .other
        }
    }

    nonisolated static func index(_ rows: [TagMastery]) -> [String: TagMastery] {
        Dictionary(rows.map { ($0.tagId, $0) }, uniquingKeysWith: { _, last in last })
    }

    func merge(source: Tag, into target: Tag) async -> Bool {
        notice = nil

        do {
            let result = try await APIClient.mergeTag(keepId: target.id, sourceId: source.id)

            notice = "Moved \(result.assignmentsMoved) tags"
            await load()

            return true
        } catch {
            errorMessage = TagError.message(for: error)

            return false
        }
    }
}

@Observable
@MainActor
final class TagDetailModel {
    let tag: Tag
    var nodes: [TagNode] = []
    var capped = false
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var openedTopic: Topic?
    var openMessage: String?

    init(tag: Tag) {
        self.tag = tag
    }

    func nodes(of kind: String) -> [TagNode] { nodes.filter { $0.kind == kind } }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let result = try await APIClient.tagNodes(tagId: tag.id)

            nodes = result.nodes
            capped = result.capped
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = TagError.message(for: error)
        }
    }

    func open(_ node: TagNode) async {
        openMessage = nil

        guard let curriculumId = node.curriculumId,
              let detail = try? await APIClient.getCurriculumDetail(curriculumId),
              let topic = detail.modules.flatMap(\.topics).first(where: { $0.id == node.id })
        else {
            openMessage = "Couldn't open this topic."

            return
        }

        openedTopic = topic
    }
}
