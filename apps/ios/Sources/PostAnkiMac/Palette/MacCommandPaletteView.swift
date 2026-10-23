import SwiftUI

extension Notification.Name {
    static let macShowCommandPalette = Notification.Name("macShowCommandPalette")
}

struct MacCommandPaletteView: View {
    @Environment(\.zoomScale) private var zoomScale

    private var zoom: CGFloat { CGFloat(zoomScale) }

    @Environment(\.dismiss) private var dismiss
    @Environment(\.macNavigator) private var navigator

    @State private var query = ""
    @State private var highlighted: String?
    @FocusState private var searchFocused: Bool

    private var results: [MacFeature] {
        MacCommandPaletteMatcher.results(query: query, in: MacFeatureRegistry.features)
    }

    var body: some View {
        VStack(spacing: 0) {
            TextField("Jump to…", text: $query)
                .textFieldStyle(.plain)
                .zoomFont(.title3)
                .zoomPadding(12)
                .focused($searchFocused)
                .onSubmit(openHighlighted)
                .onKeyPress(.downArrow) { move(1) }
                .onKeyPress(.upArrow) { move(-1) }
                .onKeyPress(.escape) {
                    dismiss()

                    return .handled
                }
                .accessibilityLabel("Command palette search")

            Divider()

            ScrollViewReader { proxy in
                List(results) { feature in
                    row(feature)
                        .id(feature.id)
                        .listRowBackground(feature.id == highlighted ? Color.accentColor.opacity(0.25) : nil)
                        .contentShape(Rectangle())
                        .onTapGesture { open(feature) }
                }
                .listStyle(.plain)
                .onChange(of: highlighted) { _, id in
                    if let id { proxy.scrollTo(id) }
                }
            }
            .overlay {
                if results.isEmpty {
                    Text("No matching entries").foregroundStyle(.secondary)
                }
            }
        }
        .frame(width: 440 * zoom, height: 360 * zoom)
        .onAppear {
            searchFocused = true
            highlighted = results.first?.id
        }
        .onChange(of: query) { _, _ in highlighted = results.first?.id }
    }

    private func row(_ feature: MacFeature) -> some View {
        HStack {
            Label(feature.title, systemImage: feature.systemImage)

            Spacer()

            Text(feature.section.title)
                .zoomFont(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func move(_ delta: Int) -> KeyPress.Result {
        let ids = results.map(\.id)

        guard !ids.isEmpty else { return .handled }

        let current = highlighted.flatMap(ids.firstIndex(of:)) ?? 0
        highlighted = ids[min(max(current + delta, 0), ids.count - 1)]

        return .handled
    }

    private func openHighlighted() {
        if let feature = results.first(where: { $0.id == highlighted }) {
            open(feature)
        }
    }

    private func open(_ feature: MacFeature) {
        navigator.select(feature.id)
        dismiss()
    }
}
