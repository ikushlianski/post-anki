import PostAnkiAPI
import SwiftUI

struct FocusTriageSubjectSheet: View {
    let model: FocusTriageSubjectChangeModel
    let currentId: String?
    let onChanged: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var isCreating = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if let message = model.message {
                    Text(message)
                        .zoomFont(.caption)
                        .foregroundStyle(.red)
                        .padding(.horizontal)
                        .padding(.top, 8)
                }

                SubjectTreePickerLevel(
                    title: "Subject",
                    parent: nil,
                    nodes: model.tree,
                    selection: currentId,
                    allowsNone: false
                ) { id in
                    guard let id else { return }

                    Task { complete(await model.assign(subjectId: id)) }
                }
            }
            .navigationTitle("Subject")
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .primaryAction) {
                    Button("New subject") { isCreating = true }
                        .accessibilityIdentifier("triage-new-subject")
                }
            }
            .disabled(model.isBusy)
            .sheet(isPresented: $isCreating) {
                FocusTriageNewSubjectForm(model: model) { label in
                    guard let label else { return }

                    isCreating = false
                    complete(label)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 380, minHeight: 460)
        #endif
        .task { await model.load() }
    }

    private func complete(_ label: String?) {
        guard let label else { return }

        onChanged(label)
        dismiss()
    }
}

struct FocusTriageNewSubjectForm: View {
    let model: FocusTriageSubjectChangeModel
    let onDone: (String?) -> Void

    var body: some View {
        NewSubjectForm(
            parentChoices: model.parentChoices,
            message: model.message,
            isBusy: model.isBusy,
            confirmTitle: "Create and assign"
        ) { name, parentId, level in
            Task { onDone(await model.createAndAssign(name: name, parentId: parentId, complexityLevel: level)) }
        }
    }
}
