import Foundation

struct UserNoteInput: Encodable, Sendable {
    let note: String
}

struct UserNoteResult: Decodable, Sendable {
    let userNote: String?
}

public enum UserNote {
    public static let maxLength = 2000
}

extension APIClient {
    public static func setKnowledgeBitUserNote(bitId: String, note: String) async throws -> String? {
        let result: UserNoteResult = try await request(
            "/knowledge-bits/\(encodedSegment(bitId))/note",
            method: "PUT",
            body: UserNoteInput(note: String(note.prefix(UserNote.maxLength)))
        )

        return result.userNote
    }
}
