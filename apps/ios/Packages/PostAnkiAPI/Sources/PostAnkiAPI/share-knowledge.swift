import Foundation

public enum ShareKnowledgeError: Error, Sendable, Equatable {
    case empty
    case tooLong
}

public struct ShareKnowledgeDraft: Sendable, Equatable {
    public static let maxCharacters = 50_000

    public let text: String
    public let subjectId: String?

    public init(text: String, subjectId: String?) throws {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmed.isEmpty else { throw ShareKnowledgeError.empty }
        guard trimmed.count <= Self.maxCharacters else { throw ShareKnowledgeError.tooLong }

        self.text = trimmed
        self.subjectId = subjectId.flatMap { $0.isEmpty ? nil : $0 }
    }
}

public struct ShareSubjectOption: Sendable, Equatable, Identifiable {
    public static let auto = ShareSubjectOption(id: nil, label: "Auto")

    public let id: String?
    public let label: String

    public var tag: String { id ?? "" }
}

public enum ShareSubjectOptions {
    public static func options(from subjects: [Subject]) -> [ShareSubjectOption] {
        let byId = Dictionary(subjects.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

        func path(_ subject: Subject) -> String {
            var names = [subject.name]
            var seen: Set<String> = [subject.id]
            var parent = subject.parentId.flatMap { byId[$0] }

            while let current = parent, seen.insert(current.id).inserted {
                names.insert(current.name, at: 0)
                parent = current.parentId.flatMap { byId[$0] }
            }

            return names.joined(separator: " > ")
        }

        let rows = byId.values
            .map { ShareSubjectOption(id: $0.id, label: path($0)) }
            .sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }

        return [.auto] + rows
    }
}

public enum ShareKnowledgeMessage {
    public static let saved = "Saved to Post Anki. It will be sorted into a subject for you."
    public static let savedToSubject = "Saved to Post Anki."
    public static let nothingToSave = "There is no text to save."
    public static let tooLong = "This text is too long (over 50,000 characters). Select less and try again."
    public static let signedOut = "Open the Post Anki app and sign in, then try again."
    public static let offline = "Couldn't reach Post Anki. Check your connection and try again."
    public static let other = "Couldn't save that. Try again in a moment."

    public static func success(subjectId: String?) -> String {
        subjectId == nil ? saved : savedToSubject
    }

    public static func failure(for error: Error) -> String {
        if let share = error as? ShareKnowledgeError {
            return share == .empty ? nothingToSave : tooLong
        }

        if case APIError.unauthorized = error { return signedOut }

        if case APIError.badStatus(_, let code) = error, code == "source_too_long" { return tooLong }

        if error is URLError { return offline }

        return other
    }
}

extension APIClient {
    public static func saveSharedText(_ draft: ShareKnowledgeDraft) async throws {
        _ = try await addKnowledgeSource(content: .text(draft.text), subjectId: draft.subjectId)
    }
}
