import Foundation

extension ChatQueueModel {
    public var allPicked: Bool {
        !sortedItems.isEmpty && pickedIds.count == sortedItems.count
    }

    public func togglePicked(_ id: String) {
        guard sortedItems.contains(where: { $0.id == id }) else { return }

        if picked.contains(id) {
            picked.remove(id)
        } else {
            picked.insert(id)
        }

        pickAnchor = id
    }

    public func pickOnly(_ id: String) {
        guard sortedItems.contains(where: { $0.id == id }) else { return }

        picked = [id]
        pickAnchor = id
    }

    public func pickRange(to id: String) {
        let ids = sortedItems.map(\.id)

        guard let end = ids.firstIndex(of: id) else { return }

        guard let anchor = pickAnchor, let start = ids.firstIndex(of: anchor) else {
            togglePicked(id)

            return
        }

        picked.formUnion(ids[min(start, end)...max(start, end)])
    }

    public func toggleAllPicked() {
        if allPicked { clearPicked() } else { pickAllVisible() }
    }
}
