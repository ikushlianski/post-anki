import PostAnkiAPI

enum TriageVariantFronts {
    static func differ(_ variants: [PendingReviewVariant]) -> Bool {
        guard let first = variants.first else { return false }

        return variants.contains { $0.face != first.face }
    }

    static func variant(in variants: [PendingReviewVariant], at index: Int) -> PendingReviewVariant? {
        guard !variants.isEmpty else { return nil }

        return variants[min(max(index, 0), variants.count - 1)]
    }

    static func positionLabel(index: Int, count: Int) -> String {
        "\(min(max(index, 0), max(count - 1, 0)) + 1) of \(count)"
    }
}
