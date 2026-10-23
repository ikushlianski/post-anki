import PostAnkiAPI
import SwiftUI

struct AddGapSheet: View {
    let onSave: (String, String?, Bool) async -> String?

    @Environment(\.dismiss) private var dismiss
    @State private var label = ""
    @State private var wanted = true
    @State private var concern = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var trimmed: String {
        label.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Add a gap you want covered...", text: $label, axis: .vertical)

                Toggle("Wanted", isOn: $wanted)

                Picker("Concern", selection: $concern) {
                    Text("None").tag("")

                    ForEach(GapConcern.all, id: \.self) { value in
                        Text(GapConcern.label(value)).tag(value)
                    }
                }

                if let errorMessage {
                    Text(errorMessage).font(.caption).foregroundStyle(.red)
                }
            }
            .navigationTitle("Add gap")
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            isSaving = true
                            errorMessage = nil

                            if let failure = await onSave(trimmed, concern.isEmpty ? nil : concern, wanted) {
                                errorMessage = failure
                            } else {
                                dismiss()
                            }

                            isSaving = false
                        }
                    }
                    .disabled(trimmed.isEmpty || isSaving)
                }
            }
        }
    }
}
