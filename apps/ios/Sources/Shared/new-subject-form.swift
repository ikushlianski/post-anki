import PostAnkiAPI
import SwiftUI

struct NewSubjectForm: View {
    let parentChoices: [(id: String, label: String)]
    let message: String?
    let isBusy: Bool
    let confirmTitle: String
    let onCreate: (String, String?, ComplexityLevel?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var parentId: String?
    @State private var level: ComplexityLevel?

    private var trimmed: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $name)

                Picker("Inside", selection: $parentId) {
                    Text("Top level").tag(String?.none)

                    ForEach(parentChoices, id: \.id) { choice in
                        Text(choice.label).tag(String?.some(choice.id))
                    }
                }

                ComplexityLevelPicker(selection: $level, hasParent: parentId != nil)

                if let message {
                    Text(message).foregroundStyle(.red)
                }
            }
            .navigationTitle("New subject")
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button(confirmTitle) { onCreate(trimmed, parentId, ComplexityChoice.toSend(level, hasParent: parentId != nil)) }
                        .disabled(trimmed.isEmpty || isBusy)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 380, minHeight: 300)
        #endif
    }
}
