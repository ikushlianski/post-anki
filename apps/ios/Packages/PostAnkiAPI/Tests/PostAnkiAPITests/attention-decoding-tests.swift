import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Needs attention")
struct AttentionDecodingTests {
    @Test("should decode sources that carry an attention notice next to plain ones")
    func decodesAttention() throws {
        let sources = try Fixture.decode([PendingReviewSource].self, "pending-review-attention")

        #expect(sources.count == 3)
        #expect(sources[0].attention?.kind == .failed)
        #expect(sources[0].attention?.reason == "no_valid_items")
        #expect(sources[1].attention?.isInformational == true)
        #expect(sources[2].attention == nil)
    }

    @Test("should keep the attention notice when the source is rebuilt with other cards")
    func keepsAttentionOnRebuild() throws {
        let source = try #require(try Fixture.decode([PendingReviewSource].self, "pending-review-attention").first)

        #expect(source.withBits([]).attention == source.attention)
    }

    @Test("should read the attention count and default it to zero for older servers")
    func decodesCounts() throws {
        #expect(try Fixture.decode(PendingReviewCountResponse.self, "pending-review-count-attention").attentionCount == 2)
        #expect(try Fixture.decode(PendingReviewCountResponse.self, "pending-review-count").attentionCount == 0)
    }

    @Test("should fall back to a failed notice for a kind this app does not know")
    func unknownKind() throws {
        let json = Data(#"{"knowledgeSourceId":"a","kind":"future_kind","reason":null,"firstWords":"x","sourceText":null,"since":"2026-10-26T08:00:00Z"}"#.utf8)

        #expect(try JSONDecoder().decode(KnowledgeSourceAttention.self, from: json).kind == .failed)
    }

    @Test("should give plain wording for each kind and fall back for unknown reasons")
    func wording() {
        #expect(AttentionWording.text(kind: .stuck, reason: "no_valid_items") == AttentionWording.stuck)
        #expect(AttentionWording.text(kind: .emptyResult, reason: nil) == AttentionWording.emptyResult)
        #expect(AttentionWording.text(kind: .failed, reason: "source_empty") == "This note has no text.")
        #expect(AttentionWording.text(kind: .failed, reason: "something_new") == AttentionWording.generic)
        #expect(AttentionWording.text(kind: .failed, reason: nil) == AttentionWording.generic)
    }

    @Test("should keep the wording table in step with the web wording keys")
    func wordingMatchesWeb() throws {
        let path = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("packages/shared/src/extraction-failure.ts")

        guard let source = try? String(contentsOf: path, encoding: .utf8) else { return }

        let block = try #require(source.components(separatedBy: "EXTRACTION_FAILURE_WORDING: Record<string, string> = {").last?
            .components(separatedBy: "\n};").first)
        let keys = block.split(separator: "\n").compactMap { line -> String? in
            line.split(separator: ":", maxSplits: 1).first.map { $0.trimmingCharacters(in: .whitespaces) }
        }.filter { !$0.isEmpty }

        #expect(Set(keys) == Set(AttentionWording.failureByReason.keys))

        for literal in [AttentionWording.generic, AttentionWording.stuck, AttentionWording.emptyResult] + AttentionWording.failureByReason.values {
            #expect(source.contains(literal))
        }
    }

    @Test("should describe how long ago a notice started in plain units")
    func age() throws {
        let now = try #require(ISO8601DateFormatter().date(from: "2026-10-26T12:00:00Z"))

        #expect(AttentionWording.age(since: "2026-10-26T11:59:30Z", now: now) == "just now")
        #expect(AttentionWording.age(since: "2026-10-26T11:59:00Z", now: now) == "1 minute ago")
        #expect(AttentionWording.age(since: "2026-10-26T09:00:00.000Z", now: now) == "3 hours ago")
        #expect(AttentionWording.age(since: "2026-10-24T12:00:00Z", now: now) == "2 days ago")
        #expect(AttentionWording.age(since: "garbage", now: now) == "just now")
    }

    @Test("should decode subject counts including the unsorted bucket")
    func subjectCounts() throws {
        let rows = try Fixture.decode([KnowledgeBrowserSubjectCount].self, "knowledge-browser-subjects")

        #expect(rows.count == 3)
        #expect(rows[2].subjectId == nil)
        #expect(rows[0].matureCount == 2)
    }
}

extension NetworkContracts {
    @Suite("Needs attention contract")
    struct AttentionContractTests {
        @Test("should ask for attention notices with the attention flag")
        func listsWithFlag() async throws {
            RecordingStub.install(body: try Fixture.data("pending-review-attention"))

            _ = try await APIClient.listPendingReviewWithAttention()

            #expect(RecordingStub.last?.method == "GET")
            #expect(RecordingStub.last?.path == "/knowledge-bits/pending-review")
        }

        @Test("should send the edited note text when retrying and nothing when retrying as is")
        func retryBodies() async throws {
            RecordingStub.install(body: Data(#"{"status":"running","supersededCount":0}"#.utf8))

            _ = try await APIClient.regenerateKnowledgeSource(id: "src_1", text: "Fixed text")
            #expect(RecordingStub.last?.path == "/knowledge-sources/src_1/regeneration")
            #expect(RecordingStub.last?.body?["text"] as? String == "Fixed text")

            _ = try await APIClient.regenerateKnowledgeSource(id: "src_1")
            #expect(RecordingStub.last?.body?["text"] == nil)
        }

        @Test("should discard a note with POST to its discards path")
        func discards() async throws {
            RecordingStub.install(body: Data(#"{"counts":{}}"#.utf8))

            try await APIClient.discardKnowledgeSource(id: "src_1")

            #expect(RecordingStub.last?.method == "POST")
            #expect(RecordingStub.last?.path == "/knowledge-sources/src_1/discards")
        }

        @Test("should load subject counts from the browser subjects path")
        func loadsCounts() async throws {
            RecordingStub.install(body: try Fixture.data("knowledge-browser-subjects"))

            let rows = try await APIClient.knowledgeBrowserSubjectCounts()

            #expect(RecordingStub.last?.path == "/knowledge-bits/browser/subjects")
            #expect(rows.count == 3)
        }
    }
}
