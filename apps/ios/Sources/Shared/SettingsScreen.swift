import PostAnkiAPI
import SwiftUI

extension Notification.Name {
    static let postAnkiSettingsDidSave = Notification.Name("postanki.settingsDidSave")
}

@Observable
@MainActor
final class SettingsScreenModel {
    var address = APIClient.baseURLString {
        didSet { if address != oldValue { connectionResult = nil } }
    }
    var token = ""
    var hasToken = TokenStore.read() != nil
    var hasSavedAddress = APIClient.hasSavedBaseURL
    var errorMessage: String?
    var statusMessage: String?
    var connectionResult: ConnectionResult?
    var isTesting = false

    nonisolated static func isAddressAllowed(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }

        if scheme == "https" { return true }

        let host = url.host()?.lowercased()

        return scheme == "http" && (host == "localhost" || host == "127.0.0.1")
    }

    private func validatedAddress() -> String? {
        var trimmedAddress = address.trimmingCharacters(in: .whitespacesAndNewlines)

        if trimmedAddress.hasSuffix("/") {
            trimmedAddress.removeLast()
        }

        guard let url = URL(string: trimmedAddress),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              let host = url.host(), !host.isEmpty,
              url.path().isEmpty,
              !trimmedAddress.contains("?"),
              !trimmedAddress.contains("#") else {
            errorMessage = "Enter just the server address, starting with http:// or https:// (for example https://example.com), with no path, query or fragment."
            return nil
        }

        guard Self.isAddressAllowed(url) else {
            errorMessage = "Use an https:// address. Plain http:// is only allowed for localhost, because your access token is never sent over an unencrypted connection."
            return nil
        }

        return trimmedAddress
    }

    func save() {
        errorMessage = nil
        statusMessage = nil

        guard let trimmedAddress = validatedAddress() else { return }

        do {
            if !token.isEmpty {
                try TokenStore.save(token)
            }
        } catch {
            errorMessage = "Couldn't save the access token."
            return
        }

        APIClient.baseURLString = trimmedAddress
        address = trimmedAddress
        token = ""
        hasToken = TokenStore.read() != nil
        hasSavedAddress = APIClient.hasSavedBaseURL
        statusMessage = "Saved."
        connectionResult = nil
        NotificationCenter.default.post(name: .postAnkiSettingsDidSave, object: nil)
    }

    func testConnection() async {
        errorMessage = nil
        statusMessage = nil
        connectionResult = nil

        let enteredAddress = address

        guard let typedAddress = validatedAddress() else { return }

        isTesting = true
        defer { isTesting = false }

        let result = await ConnectionResult.run(hasToken: TokenStore.read() != nil, baseURL: typedAddress)

        if address == enteredAddress {
            connectionResult = result
        }
    }

    func copyDiagnostics() {
        let text = Diagnostics.report(failures: APIClient.recentFailures, hasToken: TokenStore.read() != nil)

        Diagnostics.copy(text)
        statusMessage = "Diagnostics copied."
    }

    func useDefaultAddress() {
        errorMessage = nil
        APIClient.clearSavedBaseURL()
        address = APIClient.baseURLString
        hasSavedAddress = false
        statusMessage = "Using the default address."
        NotificationCenter.default.post(name: .postAnkiSettingsDidSave, object: nil)
    }

    func removeToken() {
        errorMessage = nil
        statusMessage = nil

        do {
            try TokenStore.clear()
            token = ""
            hasToken = false
            connectionResult = nil
            UnsentDraftStore.shared.reset()
            statusMessage = "Token removed."
            NotificationCenter.default.post(name: .postAnkiSettingsDidSave, object: nil)
        } catch {
            errorMessage = "Couldn't remove the access token."
        }
    }
}

struct SettingsScreen: View {
    @State private var model = SettingsScreenModel()
    @State private var confirmingRemoveToken = false

    var body: some View {
        Form {
            Section("API server address") {
                TextField("https://", text: $model.address)
                    #if os(iOS)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    #endif
                    .autocorrectionDisabled()

                Text(model.hasSavedAddress ? "Using the address you saved." : "Using the default address.")
                    .foregroundStyle(.secondary)

                Button("Use default address") { model.useDefaultAddress() }
                    .disabled(!model.hasSavedAddress)
            }

            Section("Access token") {
                SecureField("Paste new token", text: $model.token)
                    #if os(iOS)
                    .textInputAutocapitalization(.never)
                    #endif
                    .autocorrectionDisabled()

                Text(model.hasToken ? "Token saved" : "No token saved")
                    .foregroundStyle(.secondary)
            }

            Section {
                Button("Save") { model.save() }

                Button("Remove token", role: .destructive) { confirmingRemoveToken = true }
                    .disabled(!model.hasToken)
            }

            Section("Connection") {
                Button("Test connection") { Task { await model.testConnection() } }
                    .disabled(model.isTesting)

                if model.isTesting {
                    ProgressView()
                } else if let result = model.connectionResult {
                    Text(result.message)
                        .foregroundStyle(result.isSuccess ? .green : .red)
                }

                Button("Copy diagnostics") { model.copyDiagnostics() }
            }

            #if os(iOS)
            SettingsToolsSection()
            #endif

            if let errorMessage = model.errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
            }

            if let statusMessage = model.statusMessage {
                Text(statusMessage)
                    .foregroundStyle(.secondary)
            }
        }
        #if os(macOS)
        .formStyle(.grouped)
        #endif
        .navigationTitle("Settings")
        .confirmationDialog("Remove the saved access token?", isPresented: $confirmingRemoveToken) {
            Button("Remove token", role: .destructive) { model.removeToken() }
        } message: {
            Text("You will need to paste it again to load your data.")
        }
    }
}
