import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Learning list writes send the right request and never lose what the user typed")
    struct LearningListWriteSmokeTests {
        private let recommendationPath = "/learning-list-items/li_01/recommendation"

        private nonisolated static let decisionFailures: [WriteFailureCase] = [
            .signedOut,
            .rejected("not_awaiting_decision", status: 409, message: "This item changed. Refreshed."),
            .offline
        ]

        private func awaitingItem() -> LearningListItem {
            Wire.fixture([LearningListItem].self, "learning-list")[0]
        }

        private func itemJSON(status: String, curriculumId: String?) -> String {
            let curriculum = curriculumId.map { "\"\($0)\"" } ?? "null"

            return """
            {"id":"li_01","url":"https://example.com/raft","rawText":null,"title":"Raft explained","kind":"article",\
            "recommendation":null,"status":"\(status)","curriculumId":\(curriculum),"createdAt":"2026-10-22T09:00:00.000Z"}
            """
        }

        @Test("should patch an approval to the recommendation and show the item as course created")
        func approveSucceeds() async throws {
            let body = #"{"item":\#(itemJSON(status: "course_created", curriculumId: "cur_9")),"curriculumId":"cur_9"}"#
            let session = FakeServerSession(["PATCH \(recommendationPath)": .json(200, body)])
            defer { session.end() }

            let model = LearningListModel()

            model.items = Wire.fixture([LearningListItem].self, "learning-list")

            await model.decide(model.items[0], approve: true)

            #expect(FakeServer.writes.map(\.method) == ["PATCH"])
            #expect(FakeServer.writes.map(\.path) == [recommendationPath])
            #expect(FakeServer.writes.first?.bodyObject == ["decision": "approve"] as NSDictionary)
            #expect(model.items.first?.status == "course_created")
            #expect(model.items.count == 2)
            #expect(model.actionMessage == nil)
        }

        @Test("should patch a decline and show the returned item")
        func declineSucceeds() async throws {
            let session = FakeServerSession(["PATCH \(recommendationPath)": .json(200, itemJSON(status: "declined", curriculumId: nil))])
            defer { session.end() }

            let model = LearningListModel()

            model.items = Wire.fixture([LearningListItem].self, "learning-list")

            await model.decide(model.items[0], approve: false)

            #expect(FakeServer.writes.first?.bodyObject == ["decision": "decline"] as NSDictionary)
            #expect(model.items.first?.status == "declined")
        }

        @Test("should leave the list untouched and explain when a decision fails", arguments: decisionFailures)
        func decideFails(failure: WriteFailureCase) async throws {
            let session = FakeServerSession(["PATCH \(recommendationPath)": failure.reply])
            defer { session.end() }

            let model = LearningListModel()

            model.items = Wire.fixture([LearningListItem].self, "learning-list")

            let before = model.items

            await model.decide(before[0], approve: true)

            #expect(model.items == before)
            #expect(model.actionMessage == failure.message)
        }

        @Test("should patch the chosen destination and adopt the returned item and course")
        func chooseDestinationSucceeds() async throws {
            let body = #"{"item":\#(itemJSON(status: "folded_in", curriculumId: "cur_3")),"curriculumId":"cur_3"}"#
            let session = FakeServerSession(["PATCH /learning-list-items/li_01/destination": .json(200, body)])
            defer { session.end() }

            let model = LearningListItemModel(item: awaitingItem())

            await model.choose(destination: "fold_in")

            #expect(FakeServer.writes.map(\.path) == ["/learning-list-items/li_01/destination"])
            #expect(FakeServer.writes.first?.bodyObject == ["destination": "fold_in"] as NSDictionary)
            #expect(model.item.status == "folded_in")
            #expect(model.openableCurriculumId == "cur_3")
            #expect(model.message == nil)
        }

        @Test("should post the chosen subject to the classification endpoint and show the updated item")
        func classifySucceeds() async throws {
            let session = FakeServerSession([
                "POST /learning-list-items/li_01/classification": .json(200, itemJSON(status: "classified", curriculumId: nil))
            ])
            defer { session.end() }

            let model = LearningListItemModel(item: awaitingItem())

            await model.classify(subjectId: "sub_01")

            #expect(FakeServer.writes.map(\.method) == ["POST"])
            #expect(FakeServer.writes.first?.bodyObject == ["subjectId": "sub_01"] as NSDictionary)
            #expect(model.item.status == "classified")
        }

        @Test("should keep the item and explain when choosing a destination fails", arguments: decisionFailures)
        func chooseFails(failure: WriteFailureCase) async throws {
            let session = FakeServerSession([
                "PATCH /learning-list-items/li_01/destination": failure.reply,
                "/learning-list-items/li_01": .json(200, itemJSON(status: "classified", curriculumId: nil))
            ])
            defer { session.end() }

            let item = awaitingItem()
            let model = LearningListItemModel(item: item)

            await model.choose(destination: "mini_course")

            #expect(model.message == failure.message)
            #expect(model.item.id == item.id)
            #expect(!model.isWorking)
        }

        @Test("should reload the item when the server says it changed underneath the user")
        func staleDecisionReloads() async throws {
            let session = FakeServerSession([
                "PATCH \(recommendationPath)": .json(409, #"{"error":"not_awaiting_decision"}"#),
                "/learning-list-items/li_01": .json(200, itemJSON(status: "parked", curriculumId: nil))
            ])
            defer { session.end() }

            let model = LearningListItemModel(item: awaitingItem())

            await model.decide(approve: true)

            #expect(model.item.status == "parked")
            #expect(model.message == "This item changed. Refreshed.")
        }

        @Test("should post the trimmed link, kind and subject and return the saved item")
        func captureSucceeds() async throws {
            let session = FakeServerSession(["POST /learning-list-items": .json(200, itemJSON(status: "captured", curriculumId: nil))])
            defer { session.end() }

            let model = CaptureLearningItemModel()

            model.url = "  https://example.com/raft  "
            model.subjectId = "sub_01"

            let saved = await model.save()

            #expect(saved?.id == "li_01")
            #expect(FakeServer.writes.map(\.method) == ["POST"])
            #expect(FakeServer.writes.first?.bodyObject == [
                "url": "https://example.com/raft",
                "kind": "article",
                "subjectId": "sub_01"
            ] as NSDictionary)
            #expect(model.errorMessage == nil)
        }

        @Test("should send the pasted description with a video link")
        func captureVideoSendsDescription() async throws {
            let session = FakeServerSession(["POST /learning-list-items": .json(200, itemJSON(status: "captured", curriculumId: nil))])
            defer { session.end() }

            let model = CaptureLearningItemModel()

            model.url = "https://example.com/talk"
            model.kind = "video"
            model.description = " Talk about raft "
            model.subjectId = "sub_01"

            _ = await model.save()

            #expect(FakeServer.writes.first?.bodyObject?["pastedDescription"] as? String == "Talk about raft")
        }

        @Test("should keep the typed link, description and subject and show the reason when capture fails", arguments: [
            WriteFailureCase.signedOut,
            WriteFailureCase.rejected("video_requires_description", message: "Add a short description for videos."),
            WriteFailureCase.rejected("source_unreachable", status: 422, message: "Couldn't reach that link."),
            WriteFailureCase.offline
        ])
        func captureFails(failure: WriteFailureCase) async throws {
            let session = FakeServerSession(["POST /learning-list-items": failure.reply])
            defer { session.end() }

            let model = CaptureLearningItemModel()

            model.url = "https://example.com/talk"
            model.kind = "video"
            model.description = "Talk about raft"
            model.subjectId = "sub_01"

            let saved = await model.save()

            #expect(saved == nil)
            #expect(model.errorMessage == failure.message)
            #expect(model.url == "https://example.com/talk")
            #expect(model.description == "Talk about raft")
            #expect(model.subjectId == "sub_01")
            #expect(model.kind == "video")
            #expect(!model.isSaving)
            #expect(model.canSave)
        }
    }
}
