import Foundation
import PostAnkiAPI
import SwiftUI

struct NotionConnectionClient: Sendable {
    var status: @Sendable () async throws -> NotionConnectionStatus
    var save: @Sendable (String) async throws -> NotionConnectionStatus
    var remove: @Sendable () async throws -> NotionConnectionStatus
    var check: @Sendable () async throws -> NotionConnectionCheck

    static let live = NotionConnectionClient(
        status: { try await APIClient.notionConnection() },
        save: { try await APIClient.saveNotionToken($0) },
        remove: { try await APIClient.removeNotionToken() },
        check: { try await APIClient.checkNotionConnection() }
    )
}

@Observable
@MainActor
final class NotionConnectionModel {
    var status: NotionConnectionStatus?
    var tokenInput = ""
    var isBusy = false
    var loadFailed = false
    var message: String?
    var messageIsError = false

    private let client: NotionConnectionClient

    init(client: NotionConnectionClient = .live) {
        self.client = client
    }

    var canSave: Bool {
        status?.canStoreToken == true && !isBusy && !tokenInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var stateText: String {
        guard let status else { return "" }

        let origin: String

        switch status.origin {
        case .settings: origin = "The token is stored in settings."
        case .env: origin = "The token comes from the server environment."
        case .none: origin = "No token is set."
        }

        return "\(status.configured ? "Connected" : "Not connected") - \(origin)"
    }

    func load() async {
        loadFailed = false

        do {
            status = try await client.status()
        } catch {
            if error is CancellationError { return }

            loadFailed = true
        }
    }

    func saveToken() async {
        guard canSave else { return }

        let token = tokenInput.trimmingCharacters(in: .whitespacesAndNewlines)

        tokenInput = ""
        isBusy = true
        defer { isBusy = false }

        do {
            status = try await client.save(token)
            show("Token saved.", error: false)
        } catch {
            if error is CancellationError { return }

            if case APIError.badStatus(409, "secret_key_missing") = error {
                show(NotionSourceText.secretKeyMissing, error: true)
            } else {
                show("Could not save the token. Try again.", error: true)
            }
        }
    }

    func disconnect() async {
        guard !isBusy else { return }

        isBusy = true
        defer { isBusy = false }

        do {
            status = try await client.remove()
            show("Disconnected.", error: false)
        } catch {
            if error is CancellationError { return }

            show("Could not disconnect. Try again.", error: true)
        }
    }

    func check() async {
        guard !isBusy else { return }

        isBusy = true
        defer { isBusy = false }

        do {
            let result = try await client.check()

            if result.ok {
                show(result.workspaceName.map { "Connected to \($0)." } ?? "Connected.", error: false)
            } else {
                show(NotionSourceText.connectionFailure(result.reason), error: true)
            }
        } catch {
            if error is CancellationError { return }

            show("Could not check the connection. Try again.", error: true)
        }
    }

    private func show(_ text: String, error: Bool) {
        message = text
        messageIsError = error
    }
}
