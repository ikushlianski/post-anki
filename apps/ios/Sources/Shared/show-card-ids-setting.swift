import SwiftUI

enum ShowCardIdsSetting {
    static let key = "showCardIds"
}

struct CopyCardIdButton: View {
    let id: String
    @AppStorage(ShowCardIdsSetting.key) private var enabled = false
    @State private var copied = false

    var body: some View {
        if enabled {
            Button(copied ? "Copied" : "Copy card id", systemImage: "number") {
                CopyToPasteboard.copy(id)
                copied = true

                Task {
                    try? await Task.sleep(for: .seconds(1.5))
                    copied = false
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .accessibilityIdentifier("copy-card-id")
        }
    }
}

struct DebuggingSettingsSection: View {
    @AppStorage(ShowCardIdsSetting.key) private var showCardIds = false

    var body: some View {
        Section {
            Toggle("Show card ids", isOn: $showCardIds)
        } header: {
            Text("Debugging")
        } footer: {
            Text("Adds a Copy card id button to cards in review. Saved on this device only.")
        }
    }
}
