import Foundation

public struct SubjectDaySkips: Codable, Sendable, Hashable {
    public let dayKey: String
    public let subjectIds: [String]

    public init(dayKey: String, subjectIds: [String]) {
        self.dayKey = dayKey
        self.subjectIds = subjectIds
    }
}

extension APIClient {
    public static func subjectDaySkips(tz: String) async throws -> SubjectDaySkips {
        try await request(skipPath(nil, tz: tz))
    }

    public static func skipSubjectForDay(_ subjectId: String, tz: String) async throws -> SubjectDaySkips {
        try await request(skipPath(subjectId, tz: tz), method: "PUT")
    }

    public static func unskipSubjectForDay(_ subjectId: String, tz: String) async throws -> SubjectDaySkips {
        try await request(skipPath(subjectId, tz: tz), method: "DELETE")
    }

    private static func skipPath(_ subjectId: String?, tz: String) -> String {
        let base = "/subject-day-skips" + (subjectId.map { "/\(encodedSegment($0))" } ?? "")

        return encodedPath(base, query: [URLQueryItem(name: "tz", value: tz)])
    }
}
