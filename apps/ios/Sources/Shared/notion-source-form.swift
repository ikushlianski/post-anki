import PostAnkiAPI
import SwiftUI

struct NotionSourceForm: View {
    @Bindable var form: NotionSourceFormModel
    let isSaving: Bool
    let errorMessage: String?
    let onSave: () -> Void
    let onCancel: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Source") {
                    TextField("Name", text: $form.name)
                    TextField("Notion page link", text: $form.pageUrl)
                        .urlTextInput()
                        .autocorrectionDisabled()

                    if !form.urlIsValid {
                        Text("Use an https link to a Notion page (notion.so or notion.site).")
                            .zoomFont(.caption)
                            .foregroundStyle(.red)
                    }
                }

                AddKnowledgeSubjectPicker(model: form.subjects)

                Section("Schedule") {
                    Stepper(value: $form.itemsPerRun, in: NotionSourceLimits.itemsPerRun) {
                        LabeledContent("Items per run", value: "\(form.itemsPerRun)")
                    }

                    Picker("Frequency", selection: $form.frequency) {
                        ForEach(NotionSourceFrequency.allCases) { Text($0.label).tag($0) }
                    }
                }

                Section {
                    Toggle(NotionSourceText.removeToggleTitle, isOn: $form.removeAfterImport)
                } footer: {
                    Text(NotionSourceText.removeHelper)
                }

                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
            }
            #if os(macOS)
            .formStyle(.grouped)
            #endif
            .navigationTitle(form.editingId == nil ? "Add source" : "Edit source")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel).disabled(isSaving)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: onSave).disabled(!form.canSave || isSaving)
                }
            }
        }
        .macSheetMinSize(width: 480, height: 560)
    }
}
