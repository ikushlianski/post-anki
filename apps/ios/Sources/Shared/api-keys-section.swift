import PostAnkiAPI
import SwiftUI

struct ApiKeysSection: View {
    @State private var model = ApiKeysModel()
    @State private var copied = false
    @State private var pendingRevoke: ApiTokenSummary?

    var body: some View {
        Group {
            Section {
                Text("Keys let tools such as Claude connect to your cards over MCP. A key is shown once, right after you create it.")
                    .zoomFont(.footnote)
                    .foregroundStyle(.secondary)

                if let created = model.created { createdBanner(created) }

                TextField("Key name", text: $model.name)
                    .accessibilityIdentifier("api-key-name")

                ForEach(ApiTokenScope.allCases) { scope in
                    Toggle(scope.label, isOn: Binding(
                        get: { model.scopes.contains(scope) },
                        set: { model.setScope(scope, on: $0) }
                    ))
                }

                Button("Create key") { Task { await model.create() } }
                    .disabled(model.isBusy)
                    .accessibilityIdentifier("api-key-create")

                if let message = model.errorMessage {
                    Text(message).foregroundStyle(.red)
                }
            } header: {
                Text("API keys")
            }

            if !model.keys.isEmpty {
                Section("Your keys") {
                    ForEach(model.keys) { key in keyRow(key) }
                }
            }
        }
        .task { await model.load() }
        .confirmationDialog(
            "Revoke this key?",
            isPresented: Binding(get: { pendingRevoke != nil }, set: { if !$0 { pendingRevoke = nil } }),
            presenting: pendingRevoke
        ) { key in
            Button("Revoke \(key.name)", role: .destructive) { Task { await model.revoke(key) } }
        } message: { key in
            Text("Tools using \(key.name) lose access straight away.")
        }
    }

    private func createdBanner(_ created: CreatedApiToken) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Copy this key now. You won't see it again.").zoomFont(.subheadline.weight(.semibold))

            Text(created.token)
                .zoomFont(ZoomFont.footnote.monospaced())
                .textSelection(.enabled)

            HStack {
                Button(copied ? "Copied" : "Copy", systemImage: "doc.on.doc") {
                    CopyToPasteboard.copy(created.token)
                    copied = true
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("api-key-copy")

                Button("I have saved it") {
                    copied = false
                    model.dismissCreated()
                }
                .buttonStyle(.borderless)
            }
        }
        .padding(.vertical, 4)
    }

    private func keyRow(_ key: ApiTokenSummary) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(key.name).zoomFont(.body.weight(.medium))

                Spacer()

                if key.isRevoked {
                    Text("Revoked").zoomFont(.caption).foregroundStyle(.red)
                } else {
                    Button("Revoke", role: .destructive) { pendingRevoke = key }
                        .buttonStyle(.borderless)
                }
            }

            Text(key.scopeLabels.joined(separator: ", ")).zoomFont(.footnote).foregroundStyle(.secondary)
            Text("Created \(ApiKeyDate.text(key.createdAt)) · Last used \(ApiKeyDate.text(key.lastUsedAt))")
                .zoomFont(.caption)
                .foregroundStyle(.secondary)

            if let revokedAt = key.revokedAt {
                Text("Revoked \(ApiKeyDate.text(revokedAt))").zoomFont(.caption).foregroundStyle(.secondary)
            }
        }
        .opacity(key.isRevoked ? 0.6 : 1)
    }
}
