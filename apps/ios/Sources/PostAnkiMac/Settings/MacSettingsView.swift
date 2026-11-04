import SwiftUI

enum MacSettingsPane: String, CaseIterable, Identifiable {
    case general
    case connection
    case notion
    case admin

    var id: String { rawValue }

    var title: String {
        switch self {
        case .general: "General"
        case .connection: "Connection"
        case .notion: "Notion sources"
        case .admin: "Admin"
        }
    }

    var summary: String {
        switch self {
        case .general: "How the app behaves on this Mac."
        case .connection: "Server address, sign-in, and review preferences."
        case .notion: "Notion pages that feed new knowledge into your library."
        case .admin: "Account-wide AI model and daily card limits."
        }
    }

    var systemImage: String {
        switch self {
        case .general: "gearshape"
        case .connection: "network"
        case .notion: "square.and.arrow.down.on.square"
        case .admin: "person.badge.key"
        }
    }
}

struct MacSettingsView: View {
    static let maxWidth: CGFloat = 720

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 56) {
                    ForEach(MacSettingsPane.allCases) { pane in
                        MacSettingsSection(pane: pane) { content(for: pane) }
                            .id(pane)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 32)
                .frame(maxWidth: Self.maxWidth)
                .frame(maxWidth: .infinity)
            }
            .safeAreaInset(edge: .top, spacing: 0) { jumpBar(proxy) }
        }
        .navigationTitle("Settings")
    }

    private func jumpBar(_ proxy: ScrollViewProxy) -> some View {
        HStack(spacing: 8) {
            ForEach(MacSettingsPane.allCases) { pane in
                Button(pane.title) { withAnimation { proxy.scrollTo(pane, anchor: .top) } }
                    .accessibilityIdentifier("settings-jump-\(pane.id)")
            }
        }
        .buttonStyle(.bordered)
        .frame(maxWidth: Self.maxWidth, alignment: .leading)
        .padding(.horizontal, 24)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity)
        .background(.bar)
    }

    @ViewBuilder
    private func content(for pane: MacSettingsPane) -> some View {
        switch pane {
        case .general: MacGeneralSettingsPane()
        case .connection: SettingsScreen(showsAdminLink: false)
        case .notion: MacNotionSourcesView(embedded: true)
        case .admin: AdminSettingsScreen(showsNotionConnection: false)
        }
    }
}

private struct MacSettingsSection<Content: View>: View {
    let pane: MacSettingsPane
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Label(pane.title, systemImage: pane.systemImage)
                    .font(.title2.weight(.semibold))
                    .accessibilityAddTraits(.isHeader)

                Text(pane.summary)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            content
                .scrollDisabled(true)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("settings-section-\(pane.id)")
    }
}

struct MacGeneralSettingsPane: View {
    @AppStorage(MacMenuBar.enabledKey) private var menuBarEnabled = true

    var body: some View {
        Form {
            Toggle("Show review count in the menu bar", isOn: $menuBarEnabled)
        }
        .formStyle(.grouped)
    }
}
