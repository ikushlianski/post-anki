import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Subjects and knowledge maps load from a fake server")
    struct StructureSmokeTests {
        private let signedOut = "Check Settings: your access token was rejected."
        private let offline = "Couldn't connect to the server. Try again."

        @Test("should load subjects with their courses and nest child subjects under their parent")
        func subjectsLoad() async throws {
            let session = FakeServerSession([
                "/subjects": .fixture("subjects"),
                "/curricula": .fixture("curricula")
            ])
            defer { session.end() }

            let model = SubjectManageModel()

            await model.load()

            #expect(model.hasLoaded)
            #expect(model.children(of: nil).map(\.id) == ["sub_01"])
            #expect(model.children(of: "sub_01").map(\.id) == ["sub_02"])
            #expect(model.courseCount(of: "sub_01") == 2)
            #expect(model.parents.map(\.id) == ["sub_01"])
        }

        @Test("should show the rejected-token message for subjects on a 401")
        func subjectsUnauthorized() async throws {
            let session = FakeServerSession(["/subjects": .status(401), "/curricula": .status(401)])
            defer { session.end() }

            let model = SubjectManageModel()

            await model.load()

            #expect(model.errorMessage == signedOut)
            #expect(!model.hasLoaded)
        }

        @Test("should show the offline message for subjects when the connection drops")
        func subjectsOffline() async throws {
            let session = FakeServerSession([
                "/subjects": .failure(.notConnectedToInternet),
                "/curricula": .failure(.notConnectedToInternet)
            ])
            defer { session.end() }

            let model = SubjectManageModel()

            await model.load()

            #expect(model.errorMessage == offline)
            #expect(!model.hasLoaded)
        }

        @Test("should open the first subject's knowledge map and flatten nested areas")
        func knowledgeMapLoads() async throws {
            let session = FakeServerSession([
                "/subjects": .fixture("subjects"),
                "/subjects/sub_01/domain-map": .fixture("domain-map")
            ])
            defer { session.end() }

            let model = DomainMapModel()

            await model.load()

            #expect(model.hasLoaded)
            #expect(model.subjectId == "sub_01")
            #expect(model.tree.map(\.id) == ["dn_01", "dn_03"])
            #expect(model.flat.map(\.id) == ["dn_01", "dn_02", "dn_03"])
            #expect(model.nodeNames["dn_02"] == "Retries")
        }

        @Test("should show an empty map, not an error, when the subject has no map yet (404)")
        func knowledgeMapMissing() async throws {
            let session = FakeServerSession([
                "/subjects": .fixture("subjects"),
                "/subjects/sub_01/domain-map": .status(404)
            ])
            defer { session.end() }

            let model = DomainMapModel()

            await model.load()

            #expect(model.hasLoaded)
            #expect(model.tree.isEmpty)
            #expect(model.errorMessage == nil)
        }

        @Test("should show the rejected-token message for knowledge maps on a 401")
        func knowledgeMapUnauthorized() async throws {
            let session = FakeServerSession(["/subjects": .status(401)])
            defer { session.end() }

            let model = DomainMapModel()

            await model.load()

            #expect(model.errorMessage == signedOut)
            #expect(!model.hasLoaded)
        }

        @Test("should show the offline message for knowledge maps when the connection drops")
        func knowledgeMapOffline() async throws {
            let session = FakeServerSession(["/subjects": .failure(.cannotConnectToHost)])
            defer { session.end() }

            let model = DomainMapModel()

            await model.load()

            #expect(model.errorMessage == offline)
            #expect(!model.hasLoaded)
        }
    }
}
