import PostAnkiAPI
import SwiftUI

struct SharePanelView: View {
    @Bindable var model: SharePanelModel
    let onCancel: () -> Void
    let onSave: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Save to Post Anki")
                .font(.headline)

            ScrollView {
                Text(model.text.isEmpty ? "No text was shared." : model.text)
                    .font(.callout)
                    .foregroundStyle(model.text.isEmpty ? .secondary : .primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
            }
            .frame(height: 110)
            .padding(8)
            .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 6))

            Picker("Subject", selection: $model.selectedTag) {
                ForEach(model.options) { option in
                    Text(option.label).tag(option.tag)
                }
            }

            if model.subjectsUnavailable {
                Text("Couldn't load your subjects. Auto will still work.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            statusLine

            HStack {
                Spacer()
                Button("Cancel", action: onCancel)
                    .keyboardShortcut(.cancelAction)
                Button("Save", action: onSave)
                    .keyboardShortcut(.defaultAction)
                    .disabled(!model.canSave)
            }
        }
        .padding(16)
        .frame(width: 420)
    }

    @ViewBuilder
    private var statusLine: some View {
        switch model.state {
        case .ready:
            EmptyView()
        case .saving:
            HStack(spacing: 6) {
                ProgressView().controlSize(.small)
                Text("Saving...")
            }
            .font(.callout)
        case .saved(let message):
            Label(message, systemImage: "checkmark.circle.fill")
                .font(.callout)
                .foregroundStyle(.green)
        case .failed(let message):
            Label(message, systemImage: "exclamationmark.triangle.fill")
                .font(.callout)
                .foregroundStyle(.red)
        }
    }
}
