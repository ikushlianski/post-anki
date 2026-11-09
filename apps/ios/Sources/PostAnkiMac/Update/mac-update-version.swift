import Foundation

struct MacUpdateVersion: Comparable, Equatable {
    let parts: [Int]

    init?(tag: String) {
        var text = Substring(tag)

        if text.hasPrefix("v") { text = text.dropFirst() }

        let numbers = text.split(separator: ".", omittingEmptySubsequences: false).map { Int($0) }

        guard numbers.count == 3, !numbers.contains(where: { $0 == nil || $0! < 0 }) else { return nil }

        parts = numbers.compactMap { $0 }
    }

    var text: String { parts.map(String.init).joined(separator: ".") }

    static func < (lhs: MacUpdateVersion, rhs: MacUpdateVersion) -> Bool {
        lhs.parts.lexicographicallyPrecedes(rhs.parts)
    }
}
