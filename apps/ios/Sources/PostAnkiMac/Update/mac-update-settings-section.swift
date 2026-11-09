import SwiftUI

struct MacUpdateSettingsSection: View {
    let checker = MacUpdateChecker.shared

    private var status: String {
        switch checker.state {
        case .idle: checker.upToDate ? "Post Anki is up to date." : ""
        case .checking: "Checking..."
        case .available(let release): "Version \(release.version.text) is available."
        case .downloading: "Downloading..."
        case .failed(let message): message
        }
    }

    var body: some View {
        Section("Updates") {
            LabeledContent("Version", value: BuildInfo.versionText)

            HStack {
                Button("Check for updates") { Task { await checker.check(manual: true) } }

                if checker.available != nil {
                    Button("Install and restart") { Task { await checker.install() } }
                }

                Text(status).foregroundStyle(.secondary)
            }
        }
    }
}
