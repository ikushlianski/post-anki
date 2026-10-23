import Foundation

enum MacCommandPaletteMatcher {
    static func score(query: String, title: String, group: String) -> Int? {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()

        if needle.isEmpty { return 0 }

        let title = title.lowercased()
        let group = group.lowercased()

        if title.hasPrefix(needle) { return 400 }
        if title.contains(needle) { return 300 }
        if group.contains(needle) { return 200 }
        if isSubsequence(needle, of: title) { return 100 }

        return nil
    }

    @MainActor
    static func results(query: String, in features: [MacFeature]) -> [MacFeature] {
        let scored = features.enumerated().compactMap { index, feature -> (Int, Int, MacFeature)? in
            guard let value = score(query: query, title: feature.title, group: feature.section.title) else {
                return nil
            }

            return (value, index, feature)
        }

        return scored
            .sorted { ($1.0, $0.1) < ($0.0, $1.1) }
            .map(\.2)
    }

    private static func isSubsequence(_ needle: String, of text: String) -> Bool {
        var remaining = needle[...]

        for character in text where character == remaining.first {
            remaining = remaining.dropFirst()
        }

        return remaining.isEmpty
    }
}
