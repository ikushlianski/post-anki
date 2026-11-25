import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Single item actions edit, move and delete one card and show a failure inline")
    struct KnowledgeItemActionsSmokeTests {
        private static let item = Wire.decode(
            KnowledgeOverviewItem.self,
            #"{"knowledgeBitId":"kb_1","question":"Q?","answer":"A","subjectId":"s_a","state":"review","dueAt":null,"lapses":0}"#
        )

        private static let subject = Wire.decode(
            Subject.self,
            #"{"id":"s_b","name":"Beta","description":null,"parentId":null}"#
        )

        private static let variants = #"{"variants":[{"id":"v_1","kind":"wh","prompt":"Other?","answer":"X"},{"id":"v_2","kind":"wh","prompt":"Q?","answer":"A"}]}"#

        private static let contextVariants = #"{"variants":[{"id":"v_1","kind":"wh","prompt":"Other?","answer":"X"},{"id":"v_2","kind":"wh","context":"At standup","prompt":"Q?","answer":"A"}]}"#

        @Test("should edit the variant that matches the shown card and keep the new wording")
        func editSucceeds() async {
            let session = FakeServerSession([
                "/knowledge-bits/kb_1/variants": .json(200, Self.variants),
                "PATCH /knowledge-bits/question-variants/v_2": .json(200, #"{"ok":true,"variantId":"v_3"}"#)
            ])
            defer { session.end() }
            let model = KnowledgeItemActionsModel(item: Self.item)

            let failure = await model.edit(context: "At standup", prompt: "New Q?", answer: "New A")

            #expect(failure == nil)
            #expect(model.question == "New Q?")
            #expect(model.answer == "New A")
            #expect(FakeServer.writes.first?.bodyObject == ["context": "At standup", "prompt": "New Q?", "answer": "New A"] as NSDictionary)
        }

        @Test("should not send a context key when the edit does not touch the context so the server keeps it")
        func editKeepsContext() async {
            let session = FakeServerSession([
                "/knowledge-bits/kb_1/variants": .json(200, Self.contextVariants),
                "PATCH /knowledge-bits/question-variants/v_2": .json(200, #"{"ok":true,"variantId":"v_3"}"#)
            ])
            defer { session.end() }
            let model = KnowledgeItemActionsModel(item: Self.item)

            await model.loadContext()

            #expect(model.context == "At standup")

            let failure = await model.edit(context: nil, prompt: "New Q?", answer: "New A")

            #expect(failure == nil)
            #expect(model.context == "At standup")
            #expect(FakeServer.writes.first?.bodyObject == ["prompt": "New Q?", "answer": "New A"] as NSDictionary)
        }

        @Test("should send an empty context when the user clears it and then show no context")
        func editClearsContext() async {
            let session = FakeServerSession([
                "/knowledge-bits/kb_1/variants": .json(200, Self.contextVariants),
                "PATCH /knowledge-bits/question-variants/v_2": .json(200, #"{"ok":true,"variantId":"v_3"}"#)
            ])
            defer { session.end() }
            let model = KnowledgeItemActionsModel(item: Self.item)

            await model.loadContext()

            let failure = await model.edit(context: "", prompt: "Q?", answer: "A")

            #expect(failure == nil)
            #expect(model.context == nil)
            #expect(FakeServer.writes.first?.bodyObject == ["context": "", "prompt": "Q?", "answer": "A"] as NSDictionary)
        }

        @Test("should keep the old wording and return a message when the edit is rejected")
        func editFails() async {
            let session = FakeServerSession([
                "/knowledge-bits/kb_1/variants": .json(200, Self.variants),
                "PATCH /knowledge-bits/question-variants/v_2": .status(500)
            ])
            defer { session.end() }
            let model = KnowledgeItemActionsModel(item: Self.item)

            let failure = await model.edit(context: nil, prompt: "New Q?", answer: "New A")

            #expect(failure == "Couldn't save this item. Try again.")
            #expect(model.question == "Q?")
        }

        @Test("should post the single id and new subject, then show the new subject")
        func moveSucceeds() async {
            let session = FakeServerSession(["POST /knowledge-bits/moves": .json(200, #"{"moved":["kb_1"],"skipped":[]}"#)])
            defer { session.end() }
            let model = KnowledgeItemActionsModel(item: Self.item)

            var told: [String] = []

            model.onMoved = { told.append($0) }

            let moved = await model.move(to: Self.subject)

            #expect(moved)
            #expect(model.subjectId == "s_b")

            await model.settle()

            #expect(told == ["s_b"])
            #expect(FakeServer.writes.first?.bodyObject == ["knowledgeBitIds": ["kb_1"], "subjectId": "s_b"] as NSDictionary)
        }

        @Test("should put the old subject back, say so and not tell the list when the item is skipped")
        func moveSkipped() async {
            let session = FakeServerSession([
                "POST /knowledge-bits/moves": .json(200, #"{"moved":[],"skipped":[{"id":"kb_1","reason":"not_approved"}]}"#)
            ])
            defer { session.end() }
            let model = KnowledgeItemActionsModel(item: Self.item)

            var told: [String] = []

            model.onMoved = { told.append($0) }

            let moved = await model.move(to: Self.subject)

            #expect(moved)
            #expect(model.subjectId == "s_b")

            await model.settle()

            #expect(model.subjectId == "s_a")
            #expect(model.message != nil)
            #expect(told.isEmpty)
        }

        @Test("should not lock the screen while a move is held and let the user suspend meanwhile")
        func moveAndSuspendWhileHeld() async throws {
            let session = FakeServerSession([
                "POST /knowledge-bits/moves": .held(200, #"{"moved":["kb_1"],"skipped":[]}"#),
                "PATCH /knowledge-bits/kb_1/schedule": .json(200, #"{"knowledgeBitId":"kb_1","suspended":true,"buriedUntil":null,"leech":false,"cardKey":null}"#)
            ])
            defer { session.end() }
            let model = KnowledgeItemActionsModel(item: Self.item)

            _ = await model.move(to: Self.subject)
            await model.toggleSuspend()

            #expect(model.subjectId == "s_b")
            #expect(model.state == "suspended")
            #expect(!model.isBusy)

            for _ in 0..<300 where FakeServer.heldCount < 1 { try await Task.sleep(for: .milliseconds(10)) }

            FakeServer.releaseHeld()
            await model.settle()

            #expect(model.state == "suspended")
        }

        @Test("should show the item as suspended at once and put the old state back when the save fails")
        func suspendRollsBack() async throws {
            let session = FakeServerSession(["PATCH /knowledge-bits/kb_1/schedule": .held(500, "{}")])
            defer { session.end() }
            let model = KnowledgeItemActionsModel(item: Self.item)
            var told: [String] = []

            model.onStateChange = { told.append($0) }
            await model.toggleSuspend()

            #expect(model.state == "suspended")

            for _ in 0..<300 where FakeServer.heldCount < 1 { try await Task.sleep(for: .milliseconds(10)) }

            FakeServer.releaseHeld()
            await model.settle()

            #expect(model.state == "review")
            #expect(model.message != nil)
            #expect(told.isEmpty)
        }

        @Test("should report the item as deleted when the server deletes it")
        func deleteSucceeds() async {
            let session = FakeServerSession(["POST /knowledge-bits/deletions": .json(200, #"{"deleted":["kb_1"],"skipped":[]}"#)])
            defer { session.end() }
            let model = KnowledgeItemActionsModel(item: Self.item)

            let deleted = await model.delete()

            #expect(deleted)
            #expect(model.message == nil)
            #expect(FakeServer.writes.first?.bodyObject == ["knowledgeBitIds": ["kb_1"]] as NSDictionary)
        }

        @Test("should show the couldn't-delete message when the connection drops")
        func deleteFails() async {
            let session = FakeServerSession(["POST /knowledge-bits/deletions": .failure(.networkConnectionLost)])
            defer { session.end() }
            let model = KnowledgeItemActionsModel(item: Self.item)

            let deleted = await model.delete()

            #expect(!deleted)
            #expect(model.message == "Couldn't connect to the server. Nothing was changed, try again in a moment.")
        }
    }
}
