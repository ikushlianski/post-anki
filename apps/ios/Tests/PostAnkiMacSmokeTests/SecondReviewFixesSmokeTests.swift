import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Admin scans, cancelled loads and sheet failures from the second review")
    struct SecondReviewFixesSmokeTests {
        private var scan: AdminScan { AdminScan.all[0] }

        @Test("should tell the admin a timed-out scan may still be running instead of a bare failure")
        func scanTimeoutWarnsAgainstRerun() async throws {
            let session = FakeServerSession([scan.path: .failure(.timedOut)])
            defer { session.end() }

            let model = AdminScansModel()

            await model.run(scan)

            #expect(model.results[scan.id]?.contains("check before running it again") == true)
            #expect(model.running.isEmpty)
        }

        @Test("should say offline for a scan that lost its connection and signed out for a rejected token")
        func scanOfflineAndSignedOut() async throws {
            let session = FakeServerSession([scan.path: .failure(.notConnectedToInternet)])
            defer { session.end() }

            let model = AdminScansModel()

            await model.run(scan)

            #expect(model.results[scan.id]?.contains("connect") == true)

            FakeServer.start([scan.path: .status(401)])
            await model.run(scan)

            #expect(model.results[scan.id]?.contains("access token") == true)
        }

        @Test("should show no scan result when the scan request was cancelled")
        func scanCancelledShowsNothing() async throws {
            let session = FakeServerSession([scan.path: .failure(.cancelled)])
            defer { session.end() }

            let model = AdminScansModel()

            await model.run(scan)

            #expect(model.results[scan.id] == nil)
            #expect(model.running.isEmpty)
        }

        @Test("should not show an offline error when a loading admin screen is cancelled")
        func adminCancelledLoadIsSilent() async throws {
            let session = FakeServerSession([
                "/admin/settings": .failure(.cancelled),
                "/admin/observability": .failure(.cancelled),
                "/admin/knowledge-bit-feedback/by-model": .failure(.cancelled)
            ])
            defer { session.end() }

            let model = AdminModel()

            await model.load()

            #expect(model.errorMessage == nil)
            #expect(!model.isLoading)
        }

        @Test("should not show an offline error when a duplicate review load is cancelled")
        func duplicatesCancelledLoadIsSilent() async throws {
            let session = FakeServerSession(["/subjects": .failure(.cancelled)])
            defer { session.end() }

            let model = DuplicateReviewModel()

            await model.load()

            #expect(model.errorMessage == nil)
            #expect(!model.isLoading)
        }

        @Test("should not show an offline error when topic notes load is cancelled")
        func topicNotesCancelledLoadIsSilent() async throws {
            let session = FakeServerSession(["/notes": .failure(.cancelled)])
            defer { session.end() }

            let model = TopicNotesModel(topicId: "top_01")

            await model.load()

            #expect(model.errorMessage == nil)
            #expect(!model.isLoading)
        }

        @Test("should hand a failed save a message to show inside the sheet, and nothing on success")
        func sheetFailureMessage() {
            #expect(SheetFailure.message(true, "ignored") == nil)
            #expect(SheetFailure.message(false, "Name already used.") == "Name already used.")
            #expect(SheetFailure.message(false, nil) != nil)
        }

        @Test("should return the failure for a rejected subject rename so the sheet can show it")
        func renameFailureReachesSheet() async throws {
            let session = FakeServerSession([:])
            defer { session.end() }

            let model = SubjectManageModel()
            let subject = try JSONDecoder().decode(
                SubjectManageSubject.self,
                from: Data(#"{"id":"sub_01","name":"Old","kind":"topic","parentId":null,"sortOrder":null}"#.utf8)
            )
            let succeeded = await model.rename(subject, to: "New")

            #expect(!succeeded)
            #expect(SheetFailure.message(succeeded, model.errorMessage) != nil)
        }
    }
}
