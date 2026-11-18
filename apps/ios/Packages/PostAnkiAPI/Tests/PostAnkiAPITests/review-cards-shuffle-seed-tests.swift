import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Review cards shuffle seed")
    struct ReviewCardsShuffleSeed {
        private let body = Data(#"{"cards":[],"counts":{"new":0,"learning":0,"review":0},"newRemainingToday":0,"nextDueAt":null}"#.utf8)

        @Test("should send the shuffle seed only when one is set")
        func queryOnlyWhenSet() async throws {
            RecordingStub.install(body: body)
            _ = try await APIClient.reviewCards(tz: "UTC", shuffleSeed: "seed-1")

            #expect(RecordingStub.last?.query?.contains("shuffleSeed=seed-1") == true)

            RecordingStub.install(body: body)
            _ = try await APIClient.reviewCards(tz: "UTC")

            #expect(RecordingStub.last?.query?.contains("shuffleSeed") == false)
        }
    }
}
