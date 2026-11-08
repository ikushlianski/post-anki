import Foundation

public struct KnowledgeHighlight: Codable, Hashable, Sendable {
    public var start: Int
    public var end: Int

    public init(start: Int, end: Int) {
        self.start = start
        self.end = end
    }
}

public enum KnowledgeHighlights {
    public static let max = 20

    public static func merged(_ list: [KnowledgeHighlight]) -> [KnowledgeHighlight] {
        let sorted = list
            .filter { $0.end > $0.start }
            .sorted { $0.start != $1.start ? $0.start < $1.start : $0.end < $1.end }
        var result: [KnowledgeHighlight] = []

        for range in sorted {
            if let last = result.last, range.start <= last.end {
                result[result.count - 1].end = Swift.max(last.end, range.end)
            } else {
                result.append(range)
            }
        }

        return result
    }

    public static func adding(_ range: KnowledgeHighlight, to existing: [KnowledgeHighlight], textLength: Int) -> [KnowledgeHighlight] {
        let clamped = KnowledgeHighlight(start: Swift.max(0, range.start), end: Swift.min(textLength, range.end))

        guard clamped.end > clamped.start else { return existing }

        let result = merged(existing + [clamped])

        return result.count > max ? existing : result
    }

    public static func shifted(from previous: String, to next: String, _ highlights: [KnowledgeHighlight]) -> [KnowledgeHighlight] {
        guard previous != next, !highlights.isEmpty else { return highlights }

        let old = Array(previous.utf16)
        let new = Array(next.utf16)
        let limit = Swift.min(old.count, new.count)
        var prefix = 0

        while prefix < limit, old[prefix] == new[prefix] { prefix += 1 }

        var suffix = 0

        while suffix < limit - prefix, old[old.count - 1 - suffix] == new[new.count - 1 - suffix] { suffix += 1 }

        let editEnd = old.count - suffix
        let nextEditEnd = new.count - suffix
        let delta = new.count - old.count

        return highlights.compactMap { range in
            if range.end <= prefix { return range }

            if range.start >= editEnd { return KnowledgeHighlight(start: range.start + delta, end: range.end + delta) }

            let coversStart = prefix <= range.start
            let coversEnd = editEnd >= range.end

            if coversStart && coversEnd { return nil }

            if coversStart { return KnowledgeHighlight(start: nextEditEnd, end: range.end + delta) }

            if coversEnd { return KnowledgeHighlight(start: range.start, end: prefix) }

            return KnowledgeHighlight(start: range.start, end: range.end + delta)
        }
    }

    public static func trimmed(_ highlights: [KnowledgeHighlight], for value: String) -> [KnowledgeHighlight] {
        guard !highlights.isEmpty else { return [] }

        let units = Array(value.utf16)
        let isBlank: (UInt16) -> Bool = { unit in
            Unicode.Scalar(unit).map { CharacterSet.whitespacesAndNewlines.contains($0) } ?? false
        }
        let leading = units.prefix(while: isBlank).count
        let trailing = leading == units.count ? 0 : units.reversed().prefix(while: isBlank).count
        let length = units.count - leading - trailing

        return merged(highlights.map {
            KnowledgeHighlight(start: Swift.max(0, $0.start - leading), end: Swift.min(length, $0.end - leading))
        })
    }

    public static func excerpt(of text: String, _ range: KnowledgeHighlight, maxChars: Int = 40) -> String {
        let units = Array(text.utf16)
        let start = Swift.min(Swift.max(0, range.start), units.count)
        let end = Swift.min(Swift.max(start, range.end), units.count)
        let slice = String(decoding: units[start..<end], as: UTF16.self)
        let collapsed = slice.split(whereSeparator: \.isWhitespace).joined(separator: " ")

        return collapsed.count > maxChars ? "\(collapsed.prefix(maxChars))…" : collapsed
    }
}
