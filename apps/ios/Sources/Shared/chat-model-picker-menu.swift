import PostAnkiAPI
import SwiftUI

struct ChatModelPickerMenu: View {
    var catalog = ChatModelCatalog.shared

    var body: some View {
        Menu {
            Button { catalog.reset() } label: {
                checked("Default", isSelected: catalog.selectedId == nil)
            }

            ForEach(catalog.options) { option in
                Button { catalog.select(option.id) } label: {
                    checked(optionTitle(option), isSelected: catalog.selectedId == option.id)
                }
            }
        } label: {
            labelView
        }
        #if os(macOS)
        .menuStyle(.borderlessButton)
        .fixedSize()
        #endif
        .task { await catalog.loadIfNeeded() }
        .accessibilityLabel("Chat model: \(catalog.currentLabel)")
        .accessibilityIdentifier("chat-model-picker")
    }

    @ViewBuilder
    private func checked(_ title: String, isSelected: Bool) -> some View {
        if isSelected { Label(title, systemImage: "checkmark") } else { Text(title) }
    }

    private func optionTitle(_ option: ChatModelOption) -> String {
        guard let hint = option.costTier.hint else { return option.label }

        return "\(option.label) (\(hint))"
    }

    @ViewBuilder
    private var labelView: some View {
        #if os(macOS)
        Label(catalog.currentLabel, systemImage: "cpu")
        #else
        Label(catalog.currentLabel, systemImage: "cpu")
            .zoomFont(.caption)
            .zoomPadding(.horizontal, 10)
            .zoomPadding(.vertical, 4)
            .background(Color.secondary.opacity(0.14), in: Capsule())
        #endif
    }
}

struct ChatQueueAnsweredBy: View {
    let modelId: String?
    var catalog = ChatModelCatalog.shared

    var body: some View {
        if let modelId {
            Text("answered by \(catalog.answeredByLabel(modelId))")
                .zoomFont(.caption2)
                .foregroundStyle(.secondary)
                .zoomPadding(.horizontal, 4)
                .accessibilityIdentifier("chat-queue-answered-by")
        }
    }
}
