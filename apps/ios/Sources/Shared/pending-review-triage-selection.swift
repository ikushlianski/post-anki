import PostAnkiAPI

struct PendingReviewTriageSelection: Equatable {
    static let maxKept = 2
    static let maxShown = 9
    static let kindPreference = ["basic", "fill_in_the_blank", "wh_question"]

    let shown: [PendingReviewVariant]
    let hiddenCount: Int
    let pickOne: Bool
    private(set) var selectedIds: [String]
    private(set) var hint: String?

    init(variants: [PendingReviewVariant], pickOne: Bool = false) {
        shown = Array(variants.prefix(Self.maxShown))
        hiddenCount = max(0, variants.count - Self.maxShown)
        self.pickOne = pickOne && variants.count > 1
        selectedIds = (pickOne ? shown.first : Self.bestVariant(in: shown)).map { [$0.id] } ?? []
    }

    var selectedIndex: Int? { shown.firstIndex { selectedIds.contains($0.id) } }

    var keepIds: [String] {
        let chosen = shown.map(\.id).filter { selectedIds.contains($0) }

        if !chosen.isEmpty { return chosen }

        return (pickOne ? shown.first : Self.bestVariant(in: shown)).map { [$0.id] } ?? []
    }

    var selectedVariant: PendingReviewVariant? { TriageVariantFronts.variant(in: shown, at: selectedIndex ?? 0) }

    var variesByOption: Bool { pickOne && TriageVariantFronts.differ(shown) }

    var canKeep: Bool { !keepIds.isEmpty }

    func isSelected(_ id: String) -> Bool { selectedIds.contains(id) }

    func label(at index: Int) -> String {
        guard shown.indices.contains(index) else { return "" }

        let variant = shown[index]
        let repeated = shown[..<index].contains { $0.kind == variant.kind }

        if repeated { return "Reworded" }

        switch variant.kind {
        case "wh_question": return "Question"
        case "fill_in_the_blank": return "Fill in the gap"
        case "basic": return "Basic"
        case "cloze": return "Cloze gap"
        default: return variant.kindLabel
        }
    }

    mutating func toggle(at index: Int) {
        hint = nil

        guard shown.indices.contains(index) else { return }

        let id = shown[index].id

        if pickOne {
            selectedIds = [id]
        } else if let position = selectedIds.firstIndex(of: id) {
            selectedIds.remove(at: position)
        } else if selectedIds.count >= Self.maxKept {
            hint = "You can keep two at most. Tap a kept card to drop it first."
        } else {
            selectedIds.append(id)
        }
    }

    mutating func move(by offset: Int) {
        guard pickOne, !shown.isEmpty else { return }

        let target = min(max((selectedIndex ?? 0) + offset, 0), shown.count - 1)

        selectedIds = [shown[target].id]
    }

    mutating func clearHint() { hint = nil }

    static func bestVariant(in variants: [PendingReviewVariant]) -> PendingReviewVariant? {
        variants.min { rank($0.kind) < rank($1.kind) }
    }

    private static func rank(_ kind: String) -> Int {
        kindPreference.firstIndex(of: kind) ?? kindPreference.count
    }
}
