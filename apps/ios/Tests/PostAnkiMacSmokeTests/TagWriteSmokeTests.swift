import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Tag writes send the right request and keep the tag lists intact on failure")
    struct TagWriteSmokeTests {
        private let mergePath = "/tags/tag_01/merge"

        private nonisolated static let mergeFailures: [WriteFailureCase] = [
            .signedOut,
            .rejected("self_merge", message: "A tag can't be merged into itself."),
            .offline
        ]

        private func loadedModel(extra: [String: FakeReply]) async -> (TagsModel, FakeServerSession) {
            var routes: [String: FakeReply] = ["/tags": .fixture("tags"), "/tags/mastery": .fixture("tag-mastery")]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let model = TagsModel()

            await model.load()

            return (model, session)
        }

        @Test("should post the source tag to the kept tag, report how many were moved and reload the list")
        func mergeSucceeds() async throws {
            let (model, session) = await loadedModel(extra: [
                "POST \(mergePath)": .json(200, #"{"assignmentsMoved":3,"assignmentsDeduped":1}"#)
            ])
            defer { session.end() }

            let kept = model.tags[0]
            let source = model.tags[1]

            let merged = await model.merge(source: source, into: kept)

            #expect(merged)
            #expect(FakeServer.writes.map(\.method) == ["POST"])
            #expect(FakeServer.writes.map(\.path) == [mergePath])
            #expect(FakeServer.writes.first?.bodyObject == ["sourceTagId": "tag_02"] as NSDictionary)
            #expect(model.notice == "Moved 3 tags")
            #expect(model.errorMessage == nil)
            #expect(FakeServer.requests.filter { $0.path == "/tags" }.count == 2)
        }

        @Test("should keep every tag in the list and explain the failure when a merge fails", arguments: mergeFailures)
        func mergeFails(failure: WriteFailureCase) async throws {
            let (model, session) = await loadedModel(extra: ["POST \(mergePath)": failure.reply])
            defer { session.end() }

            let before = model.tags

            let merged = await model.merge(source: before[1], into: before[0])

            #expect(!merged)
            #expect(model.errorMessage == failure.message)
            #expect(model.tags == before)
            #expect(model.notice == nil)
            #expect(FakeServer.writes.count == 1)
        }

        @Test("should create the tag, then attach it to the topic and show it as added")
        func createAndAssignSucceeds() async throws {
            let session = FakeServerSession([
                "POST /tags": .json(200, #"{"id":"tag_03","name":"sagas"}"#),
                "POST /tags/tag_03/assignments": .json(200, #"{"id":"asg_01"}"#)
            ])
            defer { session.end() }

            let model = TopicTagModel(topicId: "topic_07")

            let created = await model.create(name: "sagas")

            #expect(created)
            #expect(FakeServer.writes.map(\.path) == ["/tags", "/tags/tag_03/assignments"])
            #expect(FakeServer.writes.map(\.method) == ["POST", "POST"])
            #expect(FakeServer.writes[0].bodyObject == ["name": "sagas"] as NSDictionary)
            #expect(FakeServer.writes[1].bodyObject == ["nodeType": "topic", "nodeId": "topic_07"] as NSDictionary)
            #expect(model.added.map(\.name) == ["sagas"])
            #expect(model.message == nil)
        }

        @Test("should attach an existing tag to the topic with one request")
        func assignExistingSucceeds() async throws {
            let session = FakeServerSession(["POST /tags/tag_01/assignments": .json(200, #"{"id":"asg_02"}"#)])
            defer { session.end() }

            let model = TopicTagModel(topicId: "topic_07")
            let tag = Wire.decode(PostAnkiAPI.Tag.self, #"{"id":"tag_01","name":"consistency"}"#)

            let added = await model.add(tag)

            #expect(added)
            #expect(FakeServer.writes.map(\.path) == ["/tags/tag_01/assignments"])
            #expect(model.added == [tag])
        }

        @Test("should add nothing to the topic and say why when attaching a tag fails", arguments: [
            WriteFailureCase.signedOut,
            WriteFailureCase.rejected("server_error", status: 500, message: "Something went wrong. Try again."),
            WriteFailureCase.offline
        ])
        func assignFails(failure: WriteFailureCase) async throws {
            let session = FakeServerSession(["POST /tags/tag_01/assignments": failure.reply])
            defer { session.end() }

            let model = TopicTagModel(topicId: "topic_07")
            let tag = Wire.decode(PostAnkiAPI.Tag.self, #"{"id":"tag_01","name":"consistency"}"#)

            let added = await model.add(tag)

            #expect(!added)
            #expect(model.added.isEmpty)
            #expect(model.message == failure.message)
        }

        @Test("should not try to attach a tag that could not be created and keep the picker list unchanged")
        func createFails() async throws {
            let session = FakeServerSession(["POST /tags": .status(401)])
            defer { session.end() }

            let model = TopicTagModel(topicId: "topic_07")

            let created = await model.create(name: "sagas")

            #expect(!created)
            #expect(model.allTags.isEmpty)
            #expect(model.added.isEmpty)
            #expect(model.message == WriteFailureCase.signedOutMessage)
            #expect(FakeServer.writes.map(\.path) == ["/tags"])
        }

        @Test("should refresh the tag list and keep the failure message when the tag was deleted elsewhere")
        func assignMissingTagRefreshes() async throws {
            let session = FakeServerSession([
                "POST /tags/tag_09/assignments": .status(404),
                "/tags": .fixture("tags")
            ])
            defer { session.end() }

            let model = TopicTagModel(topicId: "topic_07")
            let tag = Wire.decode(PostAnkiAPI.Tag.self, #"{"id":"tag_09","name":"gone"}"#)

            let added = await model.add(tag)

            #expect(!added)
            #expect(model.message == "That tag is gone.")
            #expect(model.allTags.map(\.id) == ["tag_01", "tag_02"])
        }
    }
}
