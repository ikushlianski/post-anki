import Foundation

public enum TextFileImportResult: Sendable, Hashable, Decodable {
    case anki(importId: String, parsed: Int, skippedEmpty: Int, newlyStaged: Int)
    case source(created: Bool)

    private enum CodingKeys: String, CodingKey {
        case kind, importId, parsed, skippedEmpty, newlyStaged, created
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        switch try container.decode(String.self, forKey: .kind) {
        case "anki":
            self = .anki(
                importId: try container.decode(String.self, forKey: .importId),
                parsed: container.lenientInt(.parsed),
                skippedEmpty: container.lenientInt(.skippedEmpty),
                newlyStaged: container.lenientInt(.newlyStaged)
            )
        default:
            self = .source(created: (try? container.decodeIfPresent(Bool.self, forKey: .created)) ?? true)
        }
    }
}

public struct TextFileImportStatus: Sendable, Hashable, Decodable {
    public let importId: String
    public let staged: Int
    public let imported: Int
    public let extracted: Int
    public let finished: Int

    public var isFinished: Bool { staged == 0 && imported > 0 && finished >= imported }

    public init(importId: String, staged: Int, imported: Int, extracted: Int, finished: Int) {
        self.importId = importId
        self.staged = staged
        self.imported = imported
        self.extracted = extracted
        self.finished = finished
    }

    private enum CodingKeys: String, CodingKey {
        case importId, staged, imported, extracted, finished
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        importId = try container.decode(String.self, forKey: .importId)
        staged = container.lenientInt(.staged)
        imported = container.lenientInt(.imported)
        extracted = container.lenientInt(.extracted)
        finished = container.lenientInt(.finished)
    }

    public var summaryText: String {
        "\(staged) waiting, \(imported) imported, \(extracted) with suggestions" + (isFinished ? " — done" : "")
    }
}

struct TextFileImportInput: Encodable, Sendable {
    let text: String
    let subjectId: String?
}

extension APIClient {
    public static func uploadTextFile(text: String, subjectId: String?) async throws -> TextFileImportResult {
        try await request(
            "/text-file-imports",
            method: "POST",
            body: TextFileImportInput(text: text, subjectId: subjectId),
            timeout: 60
        )
    }

    public static func textFileImportStatus(importId: String) async throws -> TextFileImportStatus {
        try await request("/text-file-imports/\(encodedSegment(importId))")
    }
}
