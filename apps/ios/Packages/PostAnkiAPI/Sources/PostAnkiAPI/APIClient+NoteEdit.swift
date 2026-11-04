import Foundation

struct EditNoteInput: Encodable, Sendable {
    let note: String
}

struct EditListInput: Encodable, Sendable {
    let list: String
}

public struct NoteSource: Sendable, Equatable {
    public let variantId: String
    public let kind: NoteEditKind
    public let text: String

    public init(variantId: String, kind: NoteEditKind, text: String) {
        self.variantId = variantId
        self.kind = kind
        self.text = text
    }
}

struct KnowledgeBitNoteDetail: Decodable, Sendable {
    struct Phrasing: Decodable, Sendable {
        let id: String
        let kind: String
        let sentence: String?
    }

    let phrasings: [Phrasing]
}

extension APIClient {
    public static func editQuestionVariantNote(id: String, kind: NoteEditKind, text: String) async throws -> String {
        try await editQuestionVariantNoteResult(id: id, kind: kind, text: text).variantId
    }

    public static func editQuestionVariantNoteResult(id: String, kind: NoteEditKind, text: String) async throws -> EditVariantResult {
        let path = "/knowledge-bits/question-variants/\(encodedSegment(id))"
        let result: EditVariantResult

        switch kind {
        case .cloze: result = try await request(path, method: "PATCH", body: EditNoteInput(note: text))
        case .list: result = try await request(path, method: "PATCH", body: EditListInput(list: text))
        }

        return result
    }

    public static func knowledgeBitNoteSource(bitId: String) async throws -> NoteSource? {
        let detail: KnowledgeBitNoteDetail = try await request("/knowledge-bits/\(encodedSegment(bitId))")

        return detail.phrasings.lazy.compactMap { phrasing in
            guard let kind = NoteEditKind(cardKind: phrasing.kind), let text = phrasing.sentence, !text.isEmpty else { return nil }

            return NoteSource(variantId: phrasing.id, kind: kind, text: text)
        }.first
    }
}
