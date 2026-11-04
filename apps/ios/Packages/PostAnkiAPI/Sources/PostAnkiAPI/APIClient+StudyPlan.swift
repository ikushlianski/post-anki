import Foundation

extension APIClient {
    static func studyOptionsPath(_ subjectId: String) -> String {
        "/subjects/\(encodedSegment(subjectId))/study-options"
    }

    static func studyForecastPath(_ subjectId: String, timeZone: String) -> String {
        encodedPath(
            "/subjects/\(encodedSegment(subjectId))/study-forecast",
            query: [URLQueryItem(name: "tz", value: timeZone)]
        )
    }

    public static func studyOptions(subjectId: String) async throws -> SubjectStudyOptions {
        try await request(studyOptionsPath(subjectId))
    }

    public static func updateStudyOptions(
        subjectId: String,
        _ update: SubjectStudyOptionsUpdate
    ) async throws -> SubjectStudyOptions {
        try await request(studyOptionsPath(subjectId), method: "PATCH", body: update)
    }

    public static func studyForecast(
        subjectId: String,
        timeZone: String = TimeZone.current.identifier
    ) async throws -> StudyForecast {
        try await request(studyForecastPath(subjectId, timeZone: timeZone))
    }
}
