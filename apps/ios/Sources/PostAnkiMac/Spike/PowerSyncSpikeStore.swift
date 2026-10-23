#if DEBUG
import Foundation
import Observation
import PostAnkiAPI
import PowerSync

struct SpikeSubject: Identifiable, Sendable {
    let id: String
    let name: String
    let kind: String
    let parentId: String?
}

enum PowerSyncSpikeConfig {
    static var endpoint: String {
        Bundle.main.object(forInfoDictionaryKey: "PostAnkiPowerSyncURL") as? String ?? ""
    }

    static var token: String {
        Bundle.main.object(forInfoDictionaryKey: "PostAnkiPowerSyncToken") as? String ?? ""
    }

    static var isConfigured: Bool { !endpoint.isEmpty }
}

struct SpikeConnector: PowerSyncBackendConnectorProtocol {
    private let provider = SpikeCredentialsProvider(
        endpoint: PowerSyncSpikeConfig.endpoint,
        fallbackToken: PowerSyncSpikeConfig.token,
        fetchSyncToken: { try await APIClient.createSyncToken().token }
    )

    func fetchCredentials() async throws -> PowerSyncCredentials? {
        try await provider.credentials()
    }

    func uploadData(database: PowerSyncDatabaseProtocol) async throws {}
}

@MainActor
@Observable
final class PowerSyncSpikeStore {
    private(set) var subjects: [SpikeSubject] = []
    private(set) var status = "Not started"
    private(set) var errorText: String?

    private let database: PowerSyncDatabaseProtocol = PowerSyncDatabase(
        schema: Schema(
            Table(
                name: "subjects",
                columns: [
                    .text("name"),
                    .text("description"),
                    .text("kind"),
                    .text("parent_id"),
                    .integer("sort_order"),
                    .text("created_at"),
                ]
            )
        ),
        dbFilename: "powersync-spike.sqlite"
    )

    private var tasks: [Task<Void, Never>] = []

    func start() {
        guard tasks.isEmpty else { return }

        tasks.append(Task { await watchSubjects() })
        tasks.append(Task { await watchStatus() })

        guard PowerSyncSpikeConfig.isConfigured else {
            errorText = "POSTANKI_POWERSYNC_URL not set in Local.xcconfig; showing local data only."
            return
        }

        tasks.append(Task { await connect() })
    }

    private func connect() async {
        do {
            try await database.connect(connector: SpikeConnector())
        } catch {
            errorText = "Connect failed: \(error.localizedDescription)"
        }
    }

    private func watchSubjects() async {
        do {
            let stream = try database.watch(
                sql: "SELECT id, name, kind, parent_id FROM subjects ORDER BY name",
                parameters: []
            ) { cursor in
                SpikeSubject(
                    id: try cursor.getString(name: "id"),
                    name: try cursor.getString(name: "name"),
                    kind: try cursor.getString(name: "kind"),
                    parentId: try cursor.getStringOptional(name: "parent_id")
                )
            }

            for try await rows in stream {
                subjects = rows
            }
        } catch {
            errorText = "Local query failed: \(error.localizedDescription)"
        }
    }

    private func watchStatus() async {
        for await current in database.currentStatus.asFlow() {
            let sync = current.connected ? "connected" : (current.connecting ? "connecting" : "offline")
            let first = current.hasSynced == true ? "synced before" : "never synced"
            status = "\(sync), \(first)"
        }
    }
}
#endif
