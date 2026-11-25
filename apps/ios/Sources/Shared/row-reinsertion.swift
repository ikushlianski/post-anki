enum RowReinsertion {
    static func index<Item: Identifiable>(in items: [Item], before following: Set<Item.ID>) -> Int {
        items.firstIndex { following.contains($0.id) } ?? items.count
    }

    static func following<Item: Identifiable>(_ id: Item.ID, in items: [Item]) -> Set<Item.ID> {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return [] }

        return Set(items[(index + 1)...].map(\.id))
    }
}
