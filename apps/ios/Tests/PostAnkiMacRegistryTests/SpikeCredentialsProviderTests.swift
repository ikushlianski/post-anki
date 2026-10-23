import Foundation
import Testing
@testable import PostAnkiMac

struct SpikeCredentialsProviderTests {
    private struct Offline: Error {}

    private func provider(
        fallback: String = "",
        fetch: @escaping @Sendable () async throws -> String
    ) -> SpikeCredentialsProvider {
        SpikeCredentialsProvider(endpoint: "http://127.0.0.1:5590", fallbackToken: fallback, fetchSyncToken: fetch)
    }

    @Test func shouldUseTheFreshTokenFromTheServerOnEveryCall() async throws {
        let counter = Counter()
        let subject = provider { "fresh-\(await counter.next())" }

        #expect(try await subject.credentials().token == "fresh-1")
        #expect(try await subject.credentials().token == "fresh-2")
        #expect(try await subject.credentials().endpoint == "http://127.0.0.1:5590")
    }

    @Test func shouldFallBackToTheConfiguredDevTokenWhenTheServerCallFails() async throws {
        let subject = provider(fallback: "dev-token") { throw Offline() }

        #expect(try await subject.credentials().token == "dev-token")
    }

    @Test func shouldSurfaceTheErrorWhenTheServerFailsAndNoDevTokenIsConfigured() async {
        let subject = provider { throw Offline() }

        await #expect(throws: Offline.self) { try await subject.credentials() }
    }

    @Test func shouldNotFallBackWhenTheSyncWasCancelled() async {
        let subject = provider(fallback: "dev-token") { throw CancellationError() }

        await #expect(throws: CancellationError.self) { try await subject.credentials() }
    }

    @Test func shouldRefuseToConnectWithoutAServiceAddress() async {
        let subject = SpikeCredentialsProvider(endpoint: "", fallbackToken: "dev-token") { "x" }

        await #expect(throws: SpikeCredentialsError.self) { try await subject.credentials() }
    }
}

private actor Counter {
    private var value = 0

    func next() -> Int {
        value += 1

        return value
    }
}
