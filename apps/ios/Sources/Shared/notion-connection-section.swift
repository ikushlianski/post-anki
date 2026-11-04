import PostAnkiAPI
import SwiftUI

struct NotionConnectionSection: View {
    @State private var model = NotionConnectionModel()

    var body: some View {
        Section {
            if model.loadFailed {
                Text("Could not load the connection state.").foregroundStyle(.red)
                Button("Try again") { Task { await model.load() } }
            } else if let status = model.status {
                Text(model.stateText)

                if !status.canStoreToken {
                    Text(NotionSourceText.secretKeyMissing)
                        .zoomFont(.caption)
                        .foregroundStyle(.orange)
                }

                SecureField("Notion integration token", text: $model.tokenInput)
                    .autocorrectionDisabled()
                    .disabled(model.isBusy)

                Button("Save token") { Task { await model.saveToken() } }
                    .disabled(!model.canSave)
                Button("Check connection") { Task { await model.check() } }
                    .disabled(model.isBusy || !status.configured)

                if status.origin == .settings {
                    Button("Disconnect", role: .destructive) { Task { await model.disconnect() } }
                        .disabled(model.isBusy)
                }
            } else {
                ProgressView()
            }

            if let message = model.message {
                Text(message).foregroundStyle(model.messageIsError ? .red : .secondary)
            }
        } header: {
            Text("Notion connection")
        } footer: {
            Text("A saved token is never shown again.")
        }
        .task { await model.load() }
    }
}
