import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @Suite("The offline review pack lives on disk and is replaced only by a complete newer pack")
    struct ReviewPackStoreSmokeTests {
        static func card(_ variant: String, bit: String? = nil, phase: String = "review") -> ReviewCard {
            ReviewCard(
                variantId: variant,
                knowledgeBitId: bit ?? "bit_\(variant)",
                kind: "wh_question",
                prompt: "Q\(variant)",
                answer: "A\(variant)",
                background: nil,
                phase: phase,
                leech: false,
                intervalPreview: IntervalPreview(again: 60, hard: 360, good: 600, easy: 3600)
            )
        }

        static func pack(_ cards: [ReviewPackCard], generatedAt: String = "2026-11-10T12:00:00.000Z") -> ReviewPack {
            ReviewPack(generatedAt: generatedAt, dueBefore: "2026-11-11T12:00:00.000Z", truncated: false, cards: cards)
        }

        static func tempFile() -> URL {
            FileManager.default.temporaryDirectory.appendingPathComponent("pack-\(UUID().uuidString).json")
        }

        @Test("should hand back the saved cards after the app restarts")
        func survivesRestart() async throws {
            let file = Self.tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            await ReviewPackStore(fileURL: file).replace(
                Self.pack([ReviewPackCard(card: Self.card("a"), subjectId: "s1", alternates: [Self.card("a2", bit: "bit_a")])]),
                fetchStartedAt: Date()
            )

            let reopened = await ReviewPackStore(fileURL: file).cards(scope: .all)

            #expect(reopened?.cards.map(\.variantId) == ["a"])
            #expect(await ReviewPackStore(fileURL: file).alternates(forBitId: "bit_a").map(\.variantId) == ["a2"])
        }

        @Test("should replace the saved pack as a whole, never leaving a mix of old and new cards")
        func replacesAtomically() async {
            let file = Self.tempFile()
            let store = ReviewPackStore(fileURL: file)
            defer { try? FileManager.default.removeItem(at: file) }

            await store.replace(Self.pack([ReviewPackCard(card: Self.card("old"))]), fetchStartedAt: Date())
            await store.replace(Self.pack([ReviewPackCard(card: Self.card("new1")), ReviewPackCard(card: Self.card("new2"))]), fetchStartedAt: Date())

            #expect(await store.cards(scope: .all)?.cards.map(\.variantId) == ["new1", "new2"])
        }

        @Test("should only offer a subject's own cards when one subject is reviewed")
        func subjectScope() async {
            let file = Self.tempFile()
            let store = ReviewPackStore(fileURL: file)
            defer { try? FileManager.default.removeItem(at: file) }

            await store.replace(
                Self.pack([ReviewPackCard(card: Self.card("a"), subjectId: "s1"), ReviewPackCard(card: Self.card("b"), subjectId: "s2")]),
                fetchStartedAt: Date()
            )

            #expect(await store.cards(scope: .subject("s2"))?.cards.map(\.variantId) == ["b"])
        }

        @Test("should not serve a pack that was saved for a different server")
        func serverMismatch() async throws {
            let file = Self.tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            await ReviewPackStore(fileURL: file).replace(Self.pack([ReviewPackCard(card: Self.card("a"))]), fetchStartedAt: Date())

            let data = try Data(contentsOf: file)
            let object = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
            var edited = object

            edited["serverURL"] = "https://another.example"
            try JSONSerialization.data(withJSONObject: edited).write(to: file)

            #expect(await ReviewPackStore(fileURL: file).cards(scope: .all) == nil)
        }

        @Test("should keep a grade mark through a refresh for an hour, then forget it")
        func gradedSinceCarryOver() async {
            let file = Self.tempFile()
            let store = ReviewPackStore(fileURL: file)
            defer { try? FileManager.default.removeItem(at: file) }
            let started = Date()

            await store.replace(Self.pack([ReviewPackCard(card: Self.card("a")), ReviewPackCard(card: Self.card("b"))]), fetchStartedAt: Date(timeIntervalSince1970: 0))
            await store.noteGraded(variantId: "a", bitId: "bit_a", at: started.addingTimeInterval(-7200))
            await store.noteGraded(variantId: "b", bitId: "bit_b", at: started.addingTimeInterval(-60))
            await store.replace(Self.pack([ReviewPackCard(card: Self.card("a")), ReviewPackCard(card: Self.card("b"))]), fetchStartedAt: started)

            let offline = await store.cards(scope: .all)

            #expect(offline?.gradedVariantIds == ["b"])
        }

        @Test("should bring a card back after its grade is undone")
        func undoUnmarks() async {
            let file = Self.tempFile()
            let store = ReviewPackStore(fileURL: file)
            defer { try? FileManager.default.removeItem(at: file) }

            await store.replace(Self.pack([ReviewPackCard(card: Self.card("a"))]), fetchStartedAt: Date())
            await store.noteGraded(variantId: "a", bitId: "bit_a")
            await store.unmarkGraded(variantId: "a")

            #expect(await store.cards(scope: .all)?.gradedVariantIds.isEmpty == true)
            #expect(await store.counts()?.review == 1)
        }

        @Test("should count new, learning and review cards that are still to do")
        func counts() async {
            let file = Self.tempFile()
            let store = ReviewPackStore(fileURL: file)
            defer { try? FileManager.default.removeItem(at: file) }
            let cards = [Self.card("n", phase: "new"), Self.card("l", phase: "learning"), Self.card("r"), Self.card("r2")]

            await store.replace(Self.pack(cards.map { ReviewPackCard(card: $0) }), fetchStartedAt: Date())
            await store.noteGraded(variantId: "r2", bitId: "bit_r2")

            #expect(await store.counts() == ReviewCounts(new: 1, learning: 1, review: 1))
        }

        @Test("should discard an unreadable file instead of crashing")
        func unreadableFile() async throws {
            let file = Self.tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            try Data("not json".utf8).write(to: file)

            #expect(await ReviewPackStore(fileURL: file).cards(scope: .all) == nil)
            #expect(!FileManager.default.fileExists(atPath: file.path))
        }

        @Test("should remove the pack on clear")
        func clears() async {
            let file = Self.tempFile()
            let store = ReviewPackStore(fileURL: file)

            await store.replace(Self.pack([ReviewPackCard(card: Self.card("a"))]), fetchStartedAt: Date())
            await store.clear()

            #expect(await store.cards(scope: .all) == nil)
            #expect(!FileManager.default.fileExists(atPath: file.path))
        }
    }
}
