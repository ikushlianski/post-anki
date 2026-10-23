import PostAnkiAPI

struct PendingReviewTriageSelection: Equatable {
    static let maxKept = 2
    static let maxShown = 9
    static let kindPreference = ["basic", "fill_in_the_blank", "wh_question"]

    let shown: [PendingReviewVariant]
    let hiddenCount: Int
    private(set) var selectedIds: [String]
    private(set) var hint: String?

    init(variants: [PendingReviewVariant]) {
        shown = Array(variants.prefix(Self.maxShown))
        hiddenCount = max(0, variants.count - Self.maxShown)
        selectedIds = Self.bestVariant(in: shown).map { [$0.id] } ?? []
    }

    var keepIds: [String] {
        let chosen = shown.map(\.id).filter { selectedIds.contains($0) }

        if !chosen.isEmpty { return chosen }

        return Self.bestVariant(in: shown).map { [$0.id] } ?? []
    }

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
        default: return variant.kindLabel
        }
    }

    mutating func toggle(at index: Int) {
        hint = nil

        guard shown.indices.contains(index) else { return }

        let id = shown[index].id

        if let position = selectedIds.firstIndex(of: id) {
            selectedIds.remove(at: position)
        } else if selectedIds.count >= Self.maxKept {
            hint = "You can keep two at most. Tap a kept card to drop it first."
        } else {
            selectedIds.append(id)
        }
    }

    mutating func clearHint() { hint = nil }

    static func bestVariant(in variants: [PendingReviewVariant]) -> PendingReviewVariant? {
        variants.min { rank($0.kind) < rank($1.kind) }
    }

    private static func rank(_ kind: String) -> Int {
        kindPreference.firstIndex(of: kind) ?? kindPreference.count
    }
}
