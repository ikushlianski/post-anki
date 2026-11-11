import Foundation

enum CardTextSegment: Equatable {
    case prose(String)
    case code(language: String?, code: String)
}

enum FencedCodeSplitter {
    private static let tick: Unicode.Scalar = "`"
    private static let newline: Unicode.Scalar = "\n"
    private static let carriageReturn: Unicode.Scalar = "\r"

    static func hasFence(_ text: String?) -> Bool {
        guard let text, text.contains("```") else { return false }

        return split(text).contains { if case .code = $0 { true } else { false } }
    }

    static func split(_ text: String) -> [CardTextSegment] {
        let scalars = Array(text.unicodeScalars)
        let lines = lineRanges(scalars)
        var segments: [CardTextSegment] = []
        var proseStart = 0
        var index = 0

        while index < lines.count {
            guard let opening = opening(scalars, lines[index]) else {
                index += 1
                continue
            }

            let closeIndex = (index + 1..<max(index + 1, lines.count)).first { isClosing(scalars, lines[$0], ticks: opening.ticks) }
            let bodyEnd = closeIndex.map { lines[$0].lowerBound - 1 } ?? scalars.count
            let blockEnd = closeIndex.map { lines[$0].upperBound } ?? scalars.count
            let hasBody = index + 1 < lines.count && (closeIndex.map { $0 > index + 1 } ?? true)
            let body = hasBody ? string(scalars, lines[index + 1].lowerBound, bodyEnd) : ""

            if lines[index].lowerBound > proseStart {
                segments.append(.prose(string(scalars, proseStart, lines[index].lowerBound)))
            }

            segments.append(.code(language: opening.language, code: normalized(body, droppingTrailingReturn: closeIndex != nil)))
            proseStart = blockEnd
            index = (closeIndex ?? lines.count) + 1
        }

        if proseStart < scalars.count {
            segments.append(.prose(string(scalars, proseStart, scalars.count)))
        }

        return segments
    }

    private static func lineRanges(_ scalars: [Unicode.Scalar]) -> [Range<Int>] {
        var ranges: [Range<Int>] = []
        var start = 0

        for (offset, scalar) in scalars.enumerated() where scalar == newline {
            ranges.append(start..<offset)
            start = offset + 1
        }

        if start <= scalars.count, !(start == scalars.count && !scalars.isEmpty && scalars.last == newline) {
            ranges.append(start..<scalars.count)
        }

        return ranges
    }

    private static func opening(_ scalars: [Unicode.Scalar], _ line: Range<Int>) -> (ticks: Int, language: String?)? {
        var cursor = line.lowerBound

        while cursor < line.upperBound, scalars[cursor] == tick { cursor += 1 }

        let ticks = cursor - line.lowerBound

        guard ticks >= 3 else { return nil }

        let info = scalars[cursor..<line.upperBound]

        guard !info.contains(tick) else { return nil }

        let word = String(String.UnicodeScalarView(info)).split(whereSeparator: { $0.isWhitespace }).first
        let language = word.map { $0.lowercased() }

        return (ticks, language?.isEmpty == false ? language : nil)
    }

    private static func isClosing(_ scalars: [Unicode.Scalar], _ line: Range<Int>, ticks: Int) -> Bool {
        var cursor = line.lowerBound

        while cursor < line.upperBound, scalars[cursor] == tick { cursor += 1 }

        guard cursor - line.lowerBound == ticks else { return false }

        return scalars[cursor..<line.upperBound].allSatisfy { $0 == " " || $0 == "\t" || $0 == carriageReturn }
    }

    private static func normalized(_ body: String, droppingTrailingReturn: Bool) -> String {
        var scalars = Array(body.unicodeScalars)

        if droppingTrailingReturn, scalars.last == carriageReturn { scalars.removeLast() }

        var result = String.UnicodeScalarView()
        var index = 0

        while index < scalars.count {
            if scalars[index] == carriageReturn, index + 1 < scalars.count, scalars[index + 1] == newline {
                index += 1
                continue
            }

            result.append(scalars[index])
            index += 1
        }

        return String(result)
    }

    private static func string(_ scalars: [Unicode.Scalar], _ from: Int, _ to: Int) -> String {
        var view = String.UnicodeScalarView()
        view.append(contentsOf: scalars[max(0, from)..<max(from, to)])

        return String(view)
    }
}
