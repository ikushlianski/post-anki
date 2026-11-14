import Foundation
import PostAnkiAPI

@Observable
@MainActor
final class ApiKeysModel {
    typealias Lister = () async throws -> [ApiTokenSummary]
    typealias Creator = (String, [ApiTokenScope]) async throws -> CreatedApiToken
    typealias Revoker = (String) async throws -> Void

    var keys: [ApiTokenSummary] = []
    var name = ""
    var scopes: Set<ApiTokenScope> = [.knowledgeWrite]
    var created: CreatedApiToken?
    var isBusy = false
    var errorMessage: String?

    private let lister: Lister
    private let creator: Creator
    private let revoker: Revoker

    init(
        lister: @escaping Lister = { try await APIClient.listApiTokens() },
        creator: @escaping Creator = { try await APIClient.createApiToken(name: $0, scopes: $1) },
        revoker: @escaping Revoker = { try await APIClient.revokeApiToken(id: $0) }
    ) {
        self.lister = lister
        self.creator = creator
        self.revoker = revoker
    }

    func load() async {
        do {
            keys = try await lister()
        } catch {
            errorMessage = "Couldn't load your API keys."
        }
    }

    func create() async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmed.isEmpty else {
            errorMessage = "Give the key a name."

            return
        }

        isBusy = true
        errorMessage = nil
        defer { isBusy = false }

        do {
            let ordered = ApiTokenScope.allCases.filter { scopes.contains($0) }
            created = try await creator(String(trimmed.prefix(ApiTokenScope.nameMaxLength)), ordered)
            name = ""
            await load()
        } catch {
            errorMessage = "Couldn't create the key. Try again."
        }
    }

    func revoke(_ key: ApiTokenSummary) async {
        errorMessage = nil

        do {
            try await revoker(key.id)
            await load()
        } catch {
            errorMessage = "Couldn't revoke the key. Try again."
        }
    }

    func dismissCreated() {
        created = nil
    }

    func setScope(_ scope: ApiTokenScope, on: Bool) {
        if on { scopes.insert(scope) } else { scopes.remove(scope) }
    }
}

enum ApiKeyDate {
    static func text(_ iso: String?) -> String {
        guard let iso, let date = parse(iso) else { return iso ?? "Never" }

        return date.formatted(date: .abbreviated, time: .shortened)
    }

    private static func parse(_ iso: String) -> Date? {
        let plain = ISO8601DateFormatter()
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        return fractional.date(from: iso) ?? plain.date(from: iso)
    }
}
