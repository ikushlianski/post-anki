import Foundation

public struct SubjectDuplicateSuggestion: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let subjectAId: String
    public let subjectBId: String
    public let similarity: Double
    public let reason: String
    public let status: String
}

public struct SubjectDuplicateScanResult: Decodable, Sendable {
    public let suggestions: [SubjectDuplicateSuggestion]
}

public struct SubjectDuplicateResolveInput: Encodable, Sendable {
    public let status: String
    public let targetSubjectId: String?

    enum CodingKeys: String, CodingKey { case status, targetSubjectId }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        try container.encode(status, forKey: .status)
        try container.encodeIfPresent(targetSubjectId, forKey: .targetSubjectId)
    }
}

public struct SourceDuplicateSuggestion: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let sourceAId: String
    public let sourceBId: String
    public let similarity: Double?
    public let matchKind: String
    public let reason: String
    public let status: String

    public var matchText: String {
        if matchKind == "url_match" { return "Same link" }

        return similarity.map { "\(Int(($0 * 100).rounded()))% similar" } ?? "Similar"
    }
}

public struct SourceDuplicateResolveInput: Encodable, Sendable {
    public let status: String
}

public struct DuplicateReviewSourceName: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let curriculumName: String
    public let title: String?
    public let value: String

    public var displayName: String {
        let name = title?.isEmpty == false ? title! : value

        return "\(name) (\(curriculumName))"
    }
}

public enum DuplicateReviewError: Sendable {
    public static func message(for error: Error) -> String {
        if case APIError.badStatus(let status, _) = error {
            if status == 409 { return "Already handled." }
            if status == 502 { return "The scan failed. Try again later." }
        }

        return StudyToolsError.message(for: error, notFound: "That pair is gone.")
    }
}
