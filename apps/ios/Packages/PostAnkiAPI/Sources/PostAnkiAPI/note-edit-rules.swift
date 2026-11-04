import Foundation

public enum NoteEditKind: Sendable, Equatable {
    case cloze
    case list

    public init?(cardKind: String) {
        if cardKind == "cloze" {
            self = .cloze
        } else if CardKind.isOrderedList(cardKind) {
            self = .list
        } else {
            return nil
        }
    }
}

public enum NoteValidation: Sendable, Equatable {
    case valid(cardCount: Int)
    case invalid(String)

    public var message: String? {
        if case .invalid(let text) = self { return text }

        return nil
    }

    public var isValid: Bool { message == nil }
}

public enum NoteEditRules {
    public static let clozeMaxNumbers = 10
    public static let clozeGapMaxChars = 120
    public static let noteMaxChars = 2000
    public static let listMinSteps = 3
    public static let listMaxSteps = 8
    public static let listLineMaxChars = 120

    public static func validate(_ kind: NoteEditKind, text: String) -> NoteValidation {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)

        if trimmed.utf16.count > noteMaxChars { return .invalid("A note can hold at most \(noteMaxChars) characters.") }

        switch kind {
        case .cloze: return validateCloze(trimmed)
        case .list: return validateList(trimmed)
        }
    }

    private static func validateCloze(_ text: String) -> NoteValidation {
        let chars = Array(text)
        var numbers = Set<Int>()
        var cursor = 0

        while cursor < chars.count {
            guard let open = openMarker(chars, at: cursor) else {
                cursor += 1
                continue
            }

            let bodyStart = cursor + open.length

            guard let close = indexOf("}}", in: chars, from: bodyStart) else {
                return .invalid("A gap is missing its closing }}.")
            }

            let body = Array(chars[bodyStart..<close])

            if (bodyStart..<close).contains(where: { openMarker(chars, at: $0) != nil }) {
                return .invalid("Gaps cannot be placed inside each other.")
            }

            let separator = indexOf("::", in: body, from: 0)
            let answer = String(separator.map { body[..<$0] } ?? body[...]).trimmingCharacters(in: .whitespacesAndNewlines)

            if answer.isEmpty || open.number < 1 { return .invalid("A gap has no text inside it.") }

            if answer.utf16.count > clozeGapMaxChars {
                return .invalid("A gap can hold at most \(clozeGapMaxChars) characters.")
            }

            numbers.insert(open.number)
            cursor = close + 2
        }

        if numbers.isEmpty { return .invalid("Add at least one gap like {{c1::answer}}.") }

        if numbers.count > clozeMaxNumbers { return .invalid("Use at most \(clozeMaxNumbers) different gap numbers.") }

        return .valid(cardCount: numbers.count)
    }

    private static func validateList(_ text: String) -> NoteValidation {
        let lines = text.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let title = lines.first ?? ""
        let steps = lines.dropFirst().map { stripStepPrefix($0).trimmingCharacters(in: .whitespacesAndNewlines) }

        if title.isEmpty { return .invalid("Put the list title on the first line.") }

        if title.utf16.count > listLineMaxChars { return .invalid("The title can hold at most \(listLineMaxChars) characters.") }

        if steps.contains(where: \.isEmpty) { return .invalid("A step has no text.") }

        if steps.count < listMinSteps { return .invalid("A list needs at least \(listMinSteps) steps, one per line.") }

        if steps.count > listMaxSteps { return .invalid("A list can hold at most \(listMaxSteps) steps.") }

        if steps.contains(where: { $0.utf16.count > listLineMaxChars }) {
            return .invalid("A step can hold at most \(listLineMaxChars) characters.")
        }

        if ([title] + steps).contains(where: { $0.contains(CardKind.blank) }) {
            return .invalid("Text cannot contain \(CardKind.blank).")
        }

        if Set(steps.map(stepKey)).count != steps.count { return .invalid("Each step must be different from the others.") }

        return .valid(cardCount: steps.count * 2)
    }

    private static func stripStepPrefix(_ line: String) -> String {
        line.replacingOccurrences(of: #"^\s*(?:\d+[.)]|[-*•])\s*"#, with: "", options: .regularExpression)
    }

    private static func stepKey(_ step: String) -> String {
        step.precomposedStringWithCompatibilityMapping.lowercased()
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
    }

    private static func openMarker(_ chars: [Character], at index: Int) -> (number: Int, length: Int)? {
        guard index + 3 < chars.count, chars[index] == "{", chars[index + 1] == "{", chars[index + 2].lowercased() == "c" else {
            return nil
        }

        var end = index + 3
        var digits = ""

        while end < chars.count, chars[end].isASCII, chars[end].isNumber {
            digits.append(chars[end])
            end += 1
        }

        guard !digits.isEmpty, end + 1 < chars.count, chars[end] == ":", chars[end + 1] == ":" else { return nil }

        return (Int(digits) ?? Int.max, end + 2 - index)
    }

    private static func indexOf(_ needle: String, in chars: [Character], from start: Int) -> Int? {
        let target = Array(needle)

        guard chars.count >= target.count, start <= chars.count - target.count else { return nil }

        return (start...(chars.count - target.count)).first { Array(chars[$0..<($0 + target.count)]) == target }
    }
}
