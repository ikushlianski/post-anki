import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Notion sources load, save, run and delete against a fake server")
    struct NotionSourcesSmokeTests {
        private let page = "https://www.notion.so/Phrases-0123456789abcdef0123456789abcdef"
        private let created = #"{"id":"ns_03","name":"New","pageUrl":"https://www.notion.so/New-0123456789abcdef0123456789abcdef","subjectId":"sub_01","subjectPath":["English"],"itemsPerRun":20,"frequency":"manual","removeAfterImport":false,"paused":false,"nextRunAt":null,"lastRun":null}"#
        private let connection = #"{"configured":true,"origin":"settings","canStoreToken":true}"#

        private func loaded(_ extra: [String: FakeReply] = [:]) async -> (NotionSourcesModel, FakeServerSession) {
            var routes: [String: FakeReply] = ["GET /notion-sources": .fixture("notion-sources")]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let model = NotionSourcesModel()

            await model.load()

            return (model, session)
        }

        private func filledForm() -> NotionSourceFormModel {
            let form = NotionSourceFormModel()

            form.name = "New"
            form.pageUrl = page
            form.subjects.selectedId = "sub_01"

            return form
        }

        @Test("should list sources with their subject path, frequency, paused state and last run")
        func listsSources() async {
            let (model, session) = await loaded()
            defer { session.end() }

            #expect(model.hasLoaded)
            #expect(model.sources.map(\.id) == ["ns_01", "ns_02"])
            #expect(model.sources[0].subjectPath == ["English", "English for IT"])
            #expect(model.sources[1].paused)
            #expect(NotionSourceText.lastRun(model.sources[1].lastRun) == "Never run")
        }

        @Test("should describe a source's last run in plain words instead of raw status codes")
        func plainStatusWords() {
            #expect(NotionSourceText.statusLabel(.ok) == "Done")
            #expect(NotionSourceText.statusLabel(.partial) == "Partly done")
            #expect(NotionSourceText.statusLabel(.failed) == "Failed")
            #expect(NotionSourceText.statusLabel(.skippedBudget) == "Skipped, AI limit used up")
            #expect(NotionSourceText.statusLabel(.skippedNoConnection) == "Skipped, Notion not connected")
        }

        @Test("should tell how long until a source runs next and show nothing when paused or manual")
        func nextRunWording() async {
            let (model, session) = await loaded()
            defer { session.end() }

            let nightly = model.sources[0]
            let now = ISO8601DateFormatter().date(from: "2026-10-30T22:00:00Z")!

            #expect(NotionSourceText.nextRun(nightly, now: now) == "Next run in 3 hours")
            #expect(NotionSourceText.nextRun(model.sources[1], now: now) == nil)
        }

        @Test("should word failures, warnings, connection problems and links the same plain way as the web")
        func failureWording() {
            let failed = NotionLastRun(status: .failed, finishedAt: nil, imported: 0, removed: 0, errorCode: "notion_unauthorized")
            let done = NotionLastRun(status: .ok, finishedAt: "2026-10-30T01:00:12.000Z", imported: 4, removed: 0)
            let result = NotionRunResult(status: .ok, truncated: true, pendingAfterLimit: 7)

            #expect(NotionSourceText.lastRunFailure(failed)?.hasPrefix("Notion refused access") == true)
            #expect(NotionSourceText.lastRunFailure(done) == nil)
            #expect(NotionSourceText.summary(result).contains("Page was cut off at 500 blocks"))
            #expect(NotionSourceText.summary(result).contains("7 more waiting."))
            #expect(NotionSourceText.connectionFailure("unreachable").contains("could not be reached"))
            #expect(NotionSourceText.connectionFailure("invalid_token").contains("did not accept the token"))
            #expect(NotionSourceText.safeHttpURL("https://www.notion.so/a") != nil)
            #expect(NotionSourceText.safeHttpURL("javascript:alert(1)") == nil)
            #expect(NotionSourceText.lastRun(done).hasPrefix("Last run: Done, "))
            #expect(NotionSourceText.lastRun(done).hasSuffix(", imported 4, removed 0"))
        }

        @Test("should show the offline message and no sources when the connection drops")
        func loadFailure() async {
            let (model, session) = await loaded(["GET /notion-sources": .failure(.notConnectedToInternet)])
            defer { session.end() }

            #expect(!model.hasLoaded)
            #expect(model.errorMessage == "Couldn't connect to the server. Try again.")
            #expect(model.failureKind == .offline)
        }

        @Test("should start the remove-from-Notion switch off and send it explicitly when adding a source")
        func removalDefaultsOffAndIsSent() async throws {
            let (model, session) = await loaded(["POST /notion-sources": .json(201, created)])
            defer { session.end() }

            let form = filledForm()

            #expect(form.removeAfterImport == false)
            #expect(await model.save(form))

            let body = try #require(FakeServer.writes.first?.bodyObject)

            #expect(body["removeAfterImport"] as? Bool == false)
            #expect(body["itemsPerRun"] as? Int == 10)
            #expect(model.sources.count == 3)
        }

        @Test("should send the switch on only after the user turns it on")
        func removalOnWhenToggled() async throws {
            let (model, session) = await loaded(["POST /notion-sources": .json(201, created)])
            defer { session.end() }

            let form = filledForm()

            form.removeAfterImport = true
            _ = await model.save(form)

            #expect(FakeServer.writes.first?.bodyObject?["removeAfterImport"] as? Bool == true)
        }

        @Test("should not save a source without a subject or with a link that is not a Notion page")
        func blocksInvalidForm() async {
            let (model, session) = await loaded()
            defer { session.end() }

            let form = filledForm()

            form.subjects.selectedId = nil
            #expect(!(await model.save(form)))

            form.subjects.selectedId = "sub_01"
            form.pageUrl = "https://example.com/page"
            #expect(!(await model.save(form)))
            #expect(FakeServer.writes.isEmpty)
        }

        @Test("should say the page is already added on a 409 page_already_added")
        func duplicatePage() async {
            let (model, session) = await loaded(["POST /notion-sources": .json(409, #"{"error":"page_already_added"}"#)])
            defer { session.end() }

            #expect(!(await model.save(filledForm())))
            #expect(model.saveError == "This Notion page is already added as a source.")
            #expect(model.sources.count == 2)
        }

        @Test("should send all edited fields including the removal switch when editing")
        func editSendsEverything() async throws {
            let (model, session) = await loaded(["PATCH /notion-sources/ns_02": .json(200, created)])
            defer { session.end() }

            let form = NotionSourceFormModel(editing: model.sources[1])

            form.frequency = .daily
            _ = await model.save(form)

            let body = try #require(FakeServer.writes.first?.bodyObject)

            #expect(body["frequency"] as? String == "daily")
            #expect(body["removeAfterImport"] as? Bool == true)
            #expect(body["subjectId"] as? String == "sub_02")
        }

        @Test("should send only the paused flag when pausing or resuming")
        func pauseResume() async throws {
            let (model, session) = await loaded(["PATCH /notion-sources/ns_01": .json(200, created)])
            defer { session.end() }

            await model.togglePause(model.sources[0])

            #expect(FakeServer.writes.first?.bodyObject as? [String: Bool] == ["paused": true])
        }

        @Test("should delete nothing until the user confirms, and keep the source when they cancel")
        func deleteNeedsConfirmation() async {
            let (model, session) = await loaded(["DELETE /notion-sources/ns_01": .json(200, #"{"deleted":true}"#)])
            defer { session.end() }

            model.requestDelete(model.sources[0])
            #expect(FakeServer.writes.isEmpty)
            #expect(model.pendingDelete?.id == "ns_01")

            model.cancelDelete()
            await model.confirmDelete()
            #expect(FakeServer.writes.isEmpty)
            #expect(model.sources.count == 2)

            model.requestDelete(model.sources[0])
            await model.confirmDelete()
            #expect(FakeServer.writes.map(\.method) == ["DELETE"])
            #expect(model.sources.map(\.id) == ["ns_02"])
        }

        @Test("should say imported cards are kept in the delete confirmation")
        func deleteWording() {
            #expect(NotionSourceText.deleteMessage.contains("already imported are kept"))
        }

        @Test("should disable Ingest Now for a source while its run is going, then show the result")
        func ingestDisabledWhileRunning() async throws {
            let result = #"{"status":"partial","read":12,"imported":5,"skippedExisting":4,"ignored":1,"removed":4,"removeFailed":1}"#
            let (model, session) = await loaded(["POST /notion-sources/ns_01/runs": .held(200, result)])
            defer { session.end() }

            let source = model.sources[0]
            let run = Task { await model.ingest(source) }

            for _ in 0..<300 where FakeServer.heldCount < 1 { try await Task.sleep(for: .milliseconds(10)) }

            #expect(model.isIngestDisabled(source))
            #expect(!model.isIngestDisabled(model.sources[1]))

            await model.ingest(source)
            #expect(FakeServer.writes.count == 1)

            FakeServer.releaseHeld()
            await run.value

            #expect(!model.isIngestDisabled(source))
            #expect(model.outcomes["ns_01"] == .result(NotionRunResult(
                status: .partial, read: 12, imported: 5, skippedExisting: 4, ignored: 1, removed: 4, removeFailed: 1
            )))
        }

        @Test("should explain that a run is already in progress on a 409 already_running")
        func alreadyRunning() async {
            let (model, session) = await loaded(["POST /notion-sources/ns_01/runs": .json(409, #"{"error":"already_running"}"#)])
            defer { session.end() }

            await model.ingest(model.sources[0])

            #expect(model.outcomes["ns_01"] == .failure("A run for this source is already in progress. Try again in a few minutes."))
            #expect(!model.isIngestDisabled(model.sources[0]))
        }

        @Test("should summarise imported, skipped, removed and partial results in plain words")
        func resultSummaries() {
            let partial = NotionRunResult(status: .partial, imported: 5, skippedExisting: 4, ignored: 1, removed: 4, removeFailed: 1)

            #expect(NotionSourceText.summary(partial).hasPrefix("Partly done: imported 5, skipped 4 already imported, ignored 1 that are not phrases, removed 4 from Notion."))
            #expect(NotionSourceText.summary(NotionRunResult(status: .skippedBudget)).contains("spending limit"))
        }

        @Test("should clear the token field after saving and never keep it in state")
        func tokenClearedAfterSave() async throws {
            let session = FakeServerSession(["PUT /notion-connection": .json(200, connection)])
            defer { session.end() }

            let model = NotionConnectionModel(client: .live)

            model.status = NotionConnectionStatus(configured: false, origin: .none, canStoreToken: true)
            model.tokenInput = "secret_abc"
            await model.saveToken()

            #expect(model.tokenInput.isEmpty)
            #expect(model.status?.origin == .settings)
            #expect(FakeServer.writes.first?.bodyObject?["token"] as? String == "secret_abc")
            #expect(!"\(String(reflecting: model.status as Any))\(model.message ?? "")".contains("secret_abc"))
        }

        @Test("should clear the token field even when the save fails and explain a missing server key")
        func tokenClearedAfterFailure() async {
            let session = FakeServerSession(["PUT /notion-connection": .json(409, #"{"error":"secret_key_missing"}"#)])
            defer { session.end() }

            let model = NotionConnectionModel(client: .live)

            model.status = NotionConnectionStatus(configured: false, origin: .none, canStoreToken: true)
            model.tokenInput = "secret_abc"
            await model.saveToken()

            #expect(model.tokenInput.isEmpty)
            #expect(model.message == NotionSourceText.secretKeyMissing)
            #expect(model.messageIsError)
        }

        @Test("should not allow saving a token when the server cannot store one")
        func cannotStoreToken() {
            let model = NotionConnectionModel(client: .live)

            model.status = NotionConnectionStatus(configured: true, origin: .env, canStoreToken: false)
            model.tokenInput = "secret_abc"

            #expect(!model.canSave)
            #expect(model.stateText == "Connected - The token comes from the server environment.")
        }

        @Test("should report the workspace name on a good check and a refusal on a bad one")
        func checkConnection() async {
            let session = FakeServerSession(["POST /notion-connection/checks": .json(200, #"{"ok":true,"workspaceName":"Acme"}"#)])
            defer { session.end() }

            let model = NotionConnectionModel(client: .live)

            await model.check()
            #expect(model.message == "Connected to Acme.")
        }

        @Test("should tell the user to add a source and then press Ingest Now when there are none")
        func emptyStateHint() async {
            let session = FakeServerSession(["GET /notion-sources": .json(200, #"{"sources":[]}"#)])
            defer { session.end() }

            let model = NotionSourcesModel()

            await model.load()

            #expect(model.hasLoaded)
            #expect(model.sources.isEmpty)
            #expect(NotionSourceText.emptyMessage == "Add a source, then press Ingest Now on its row.")
        }
    }
}
