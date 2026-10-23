#if DEBUG
import Foundation
import PowerSync

enum SpikeCredentialsError: Error {
    case noCredentials
}

struct SpikeCredentialsProvider: Sendable {
    let endpoint: String
    let fallbackToken: String
    let fetchSyncToken: @Sendable () async throws -> String

    func credentials() async throws -> PowerSyncCredentials {
        guard !endpoint.isEmpty else { throw SpikeCredentialsError.noCredentials }

        do {
            return PowerSyncCredentials(endpoint: endpoint, token: try await fetchSyncToken())
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            guard !fallbackToken.isEmpty else { throw error }

            return PowerSyncCredentials(endpoint: endpoint, token: fallbackToken)
        }
    }
}
#endif
