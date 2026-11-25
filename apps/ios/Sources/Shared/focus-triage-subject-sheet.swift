import PostAnkiAPI
import SwiftUI

struct FocusTriageSubjectSheet: View {
    let model: FocusTriageSubjectChangeModel
    let currentId: String?
    let onPicked: (_ id: String, _ label: String) -> Void

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

                if model.tree.isEmpty {
                    emptyState
                } else {
                    SubjectTreePickerLevel(
                        title: "Subject",
                        parent: nil,
                        nodes: model.tree,
                        selection: currentId,
                        allowsNone: false,
                        autofocusSearch: false
                    ) { id in
                        guard let id else { return }

                        onPicked(id, model.label(for: id))
                        dismiss()
                    }
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
                FocusTriageNewSubjectForm(model: model) { created in
                    guard let created else { return }

                    isCreating = false
                    onPicked(created.id, created.label)
                    dismiss()
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 380, minHeight: 460)
        #endif
        .task { await model.load() }
    }

    @ViewBuilder
    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()

            switch model.loadState {
            case .loading:
                ProgressView("Loading subjects…")
            case .failed:
                Text("Couldn't load subjects.")
                    .foregroundStyle(.secondary)

                Button("Retry") { Task { await model.load() } }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("triage-subjects-retry")
            case .loaded:
                Text("No subjects yet. Use New subject to create one.")
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding()
    }
}

struct FocusTriageNewSubjectForm: View {
    let model: FocusTriageSubjectChangeModel
    let onDone: ((id: String, label: String)?) -> Void

    var body: some View {
        NewSubjectForm(
            parentChoices: model.parentChoices,
            message: model.message,
            isBusy: model.isBusy,
            confirmTitle: "Create and assign"
        ) { name, parentId, level in
            Task { onDone(await model.createSubject(name: name, parentId: parentId, complexityLevel: level)) }
        }
    }
}
