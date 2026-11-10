import Foundation
import PostAnkiAPI
import Testing

private actor FetchCounter {
    private(set) var calls = 0
    private var shouldFail: Bool
    private let pack: ReviewPack

    init(pack: ReviewPack, shouldFail: Bool = false) {
        self.pack = pack
        self.shouldFail = shouldFail
    }

    func fetch() async throws -> ReviewPack {
        calls += 1
        try await Task.sleep(for: .milliseconds(80))

        if shouldFail { throw URLError(.notConnectedToInternet) }

        return pack
    }

    func failFromNowOn() { shouldFail = true }
}

extension SmokeTests {
    @MainActor
    @Suite("The pack refresher keeps the saved cards safe")
    struct ReviewPackSyncSmokeTests {
        private func store() -> (ReviewPackStore, URL) {
            let file = FileManager.default.temporaryDirectory.appendingPathComponent("sync-\(UUID().uuidString).json")

            return (ReviewPackStore(fileURL: file), file)
        }

        private func pack(_ ids: [String]) -> ReviewPack {
            ReviewPackStoreSmokeTests.pack(ids.map { ReviewPackCard(card: ReviewPackStoreSmokeTests.card($0)) })
        }

        @Test("should run only one refresh at a time when several triggers fire together")
        func singleFlight() async {
            let (packStore, file) = store()
            defer { try? FileManager.default.removeItem(at: file) }
            let counter = FetchCounter(pack: pack(["a"]))
            let sync = ReviewPackSync(store: packStore, fetch: { try await counter.fetch() }, flush: {}, hasSession: { true })

            async let first = sync.refresh(.opened)
            async let second = sync.refresh(.timer)
            _ = await (first, second)

            #expect(await counter.calls == 1)
            #expect(await packStore.cards(scope: .all)?.cards.count == 1)
        }

        @Test("should keep the saved cards when the refresh fails")
        func failureKeepsPack() async {
            let (packStore, file) = store()
            defer { try? FileManager.default.removeItem(at: file) }
            let counter = FetchCounter(pack: pack(["a", "b"]))
            let sync = ReviewPackSync(store: packStore, fetch: { try await counter.fetch() }, flush: {}, hasSession: { true })

            await sync.refresh(.opened)
            await counter.failFromNowOn()

            let refreshed = await sync.refresh(.timer)

            #expect(!refreshed)
            #expect(sync.lastRefreshFailed)
            #expect(await packStore.cards(scope: .all)?.cards.count == 2)
        }

        @Test("should send waiting grades before fetching a new pack")
        func flushesFirst() async {
            let (packStore, file) = store()
            defer { try? FileManager.default.removeItem(at: file) }
            let order = OrderLog()
            let sync = ReviewPackSync(
                store: packStore,
                fetch: {
                    await order.add("fetch")

                    return ReviewPackStoreSmokeTests.pack([])
                },
                flush: { await order.add("flush") },
                hasSession: { true }
            )

            await sync.refresh(.opened)

            #expect(await order.entries == ["flush", "fetch"])
        }

        @Test("should not refetch within a minute of a good refresh, except on the timer")
        func throttlesQuickRefreshes() async {
            let (packStore, file) = store()
            defer { try? FileManager.default.removeItem(at: file) }
            let counter = FetchCounter(pack: pack(["a"]))
            let sync = ReviewPackSync(store: packStore, fetch: { try await counter.fetch() }, flush: {}, hasSession: { true })

            await sync.refresh(.opened)
            await sync.refresh(.backgrounded)
            #expect(await counter.calls == 1)

            await sync.refresh(.timer)
            #expect(await counter.calls == 2)
        }

        @Test("should not fetch without a signed-in session")
        func noTokenNoFetch() async {
            let (packStore, file) = store()
            defer { try? FileManager.default.removeItem(at: file) }
            let counter = FetchCounter(pack: pack(["a"]))
            let sync = ReviewPackSync(store: packStore, fetch: { try await counter.fetch() }, flush: {}, hasSession: { false })

            await sync.refresh(.opened)

            #expect(await counter.calls == 0)
        }

        @Test("should stay stopped after sign-out until the next sign-in")
        func stopsAfterSignOut() async {
            let (packStore, file) = store()
            defer { try? FileManager.default.removeItem(at: file) }
            let counter = FetchCounter(pack: pack(["a"]))
            let sync = ReviewPackSync(store: packStore, fetch: { try await counter.fetch() }, flush: {}, hasSession: { true })

            sync.signedOut()
            await sync.refresh(.timer)

            #expect(await counter.calls == 0)
            #expect(await packStore.cards(scope: .all) == nil)
        }
    }
}

private actor OrderLog {
    private(set) var entries: [String] = []

    func add(_ entry: String) { entries.append(entry) }
}
