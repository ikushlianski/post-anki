import PostAnkiAPI
import SwiftUI

struct SharePanelView: View {
    @Bindable var model: SharePanelModel
    let onCancel: () -> Void
    let onSave: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ScrollView {
                        Text(model.text.isEmpty ? "No text was shared." : model.text)
                            .font(.callout)
                            .foregroundStyle(model.text.isEmpty ? .secondary : .primary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxHeight: 140)
                }

                Section {
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
                }

                statusSection
            }
            .navigationTitle("Save to Post Anki")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: onSave)
                        .disabled(!model.canSave)
                }
            }
        }
    }

    @ViewBuilder
    private var statusSection: some View {
        switch model.state {
        case .ready:
            EmptyView()
        case .saving:
            Section {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Saving...")
                }
            }
        case .saved(let message):
            Section {
                Label(message, systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            }
        case .failed(let message):
            Section {
                Label(message, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
            }
        }
    }
}
