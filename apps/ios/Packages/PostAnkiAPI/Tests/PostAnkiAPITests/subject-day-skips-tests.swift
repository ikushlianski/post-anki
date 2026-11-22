import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Subject day skips")
    struct SubjectDaySkipsContract {
        private let body = Data(#"{"dayKey":"2026-11-22","subjectIds":["s1","s2"]}"#.utf8)

        @Test("should read the skipped subjects of the local day")
        func readsSkips() async throws {
            RecordingStub.install(body: body)

            let skips = try await APIClient.subjectDaySkips(tz: "Europe/Warsaw")

            #expect(skips == SubjectDaySkips(dayKey: "2026-11-22", subjectIds: ["s1", "s2"]))
            #expect(RecordingStub.last?.method == "GET")
            #expect(RecordingStub.last?.path == "/subject-day-skips")
            #expect(RecordingStub.last?.query == "tz=Europe%2FWarsaw")
        }

        @Test("should skip with PUT and restore with DELETE on the subject path")
        func skipAndRestore() async throws {
            RecordingStub.install(body: body)
            _ = try await APIClient.skipSubjectForDay("s 1", tz: "UTC")

            #expect(RecordingStub.last?.method == "PUT")
            #expect(RecordingStub.last?.path == "/subject-day-skips/s%201")
            #expect(RecordingStub.last?.query == "tz=UTC")

            RecordingStub.install(body: body)
            _ = try await APIClient.unskipSubjectForDay("s1", tz: "UTC")

            #expect(RecordingStub.last?.method == "DELETE")
        }

        @Test("should decode the skipped flag on due counts and default it to false")
        func dueCountSkippedFlag() throws {
            let json = #"{"subjects":[{"subjectId":"a","dueCount":1,"newCount":0,"todayCount":1,"skipped":true},{"subjectId":"b","dueCount":1,"newCount":0,"todayCount":1}],"unsorted":{"dueCount":0,"newCount":0},"newRemainingToday":0}"#
            let counts = try JSONDecoder().decode(SubjectReviewDueCounts.self, from: Data(json.utf8))

            #expect(counts.subjects.map(\.skipped) == [true, false])
        }

        @Test("should decode the pack day key and skipped subjects, and accept an older pack without them")
        func packSkipFields() throws {
            let withSkips = #"{"generatedAt":"g","dueBefore":"d","truncated":false,"cards":[],"dayKey":"2026-11-22","skippedSubjectIds":["s1"]}"#
            let older = #"{"generatedAt":"g","dueBefore":"d","truncated":false,"cards":[]}"#
            let decoder = JSONDecoder()
            let pack = try decoder.decode(ReviewPack.self, from: Data(withSkips.utf8))
            let old = try decoder.decode(ReviewPack.self, from: Data(older.utf8))

            #expect(pack.dayKey == "2026-11-22" && pack.skippedSubjectIds == ["s1"])
            #expect(old.dayKey == nil && old.skippedSubjectIds.isEmpty)
        }
    }
}
