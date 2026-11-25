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

    let writes = SerialWriteQueue()
    var needsReconcile = false

    init() {
        writes.onIdle = { [weak self] in await self?.reconcile() }
    }

    func settle() async { await writes.settle() }

    var filtered: [Tag] {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let sorted = tags.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

        return text.isEmpty ? sorted : sorted.filter { $0.name.localizedCaseInsensitiveContains(text) }
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
            async let fetchedTags = APIClient.listTags()
            async let fetchedMastery = APIClient.tagMastery()
            let loadedTags = try await fetchedTags
            let loadedMastery = Self.index(try await fetchedMastery)

            if whenIdle && !writes.isIdle { return }

            tags = loadedTags
            mastery = loadedMastery
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            if whenIdle { return }

            errorMessage = TagError.message(for: error)
            failureKind = ProgressLoadError.from(error) ?? .other
        }
    }

    private func reconcile() async {
        guard needsReconcile else { return }

        needsReconcile = false
        await load(whenIdle: true)
    }

    nonisolated static func index(_ rows: [TagMastery]) -> [String: TagMastery] {
        Dictionary(rows.map { ($0.tagId, $0) }, uniquingKeysWith: { _, last in last })
    }

    func merge(source: Tag, into target: Tag) async -> Bool {
        notice = nil
        errorMessage = nil

        let removedMastery = mastery[source.id]

        tags.removeAll { $0.id == source.id }
        mastery[source.id] = nil

        writes.enqueue { [self] in
            do {
                let result = try await APIClient.mergeTag(keepId: target.id, sourceId: source.id)

                notice = "Moved \(CountLabel.text(result.assignmentsMoved, "tag"))"
                needsReconcile = true
            } catch {
                if !tags.contains(where: { $0.id == source.id }) { tags.append(source) }

                mastery[source.id] = removedMastery
                errorMessage = TagError.message(for: error)
                needsReconcile = true
            }
        }

        return true
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
