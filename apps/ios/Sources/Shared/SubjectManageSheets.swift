import PostAnkiAPI
import SwiftUI

struct SubjectNewSheet: View {
    let subjects: [SubjectManageSubject]
    let onCreate: (String, String?) async -> String?

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var parentId: String?
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var trimmed: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $name)

                Picker("Inside", selection: $parentId) {
                    Text("Top level").tag(String?.none)

                    ForEach(subjects) { subject in
                        Text(subject.name).tag(String?.some(subject.id))
                    }
                }

                SheetErrorText(message: errorMessage)
            }
            .navigationTitle("New subject")
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

            }
            .mainActionControls([
                MainActionTile(title: "Add", style: .prominent, isLoading: isSaving, isDisabled: trimmed.isEmpty) {
                    Task {
                        isSaving = true
                        errorMessage = nil

                        if let failure = await onCreate(trimmed, parentId) {
                            errorMessage = failure
                        } else {
                            dismiss()
                        }

                        isSaving = false
                    }
                }
            ])
        }
    }
}

struct SubjectRenameSheet: View {
    let title: String
    let currentName: String
    let onSave: (String) async -> String?

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(title: String, currentName: String, onSave: @escaping (String) async -> String?) {
        self.title = title
        self.currentName = currentName
        self.onSave = onSave
        _name = State(initialValue: currentName)
    }

    private var trimmed: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $name)

                SheetErrorText(message: errorMessage)
            }
            .navigationTitle(title)
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

            }
            .mainActionControls([
                MainActionTile(title: "Save", style: .prominent, isLoading: isSaving, isDisabled: trimmed.isEmpty) {
                    Task {
                        isSaving = true
                        errorMessage = nil

                        if let failure = await onSave(trimmed) {
                            errorMessage = failure
                        } else {
                            dismiss()
                        }

                        isSaving = false
                    }
                }
            ])
        }
    }
}

struct SubjectMergeSheet: View {
    let source: SubjectManageSubject
    let candidates: [SubjectManageSubject]
    let onMerge: (SubjectManageSubject) async -> String?

    @Environment(\.dismiss) private var dismiss
    @State private var chosen: SubjectManageSubject?
    @State private var isMerging = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                SheetErrorText(message: errorMessage)

                if candidates.isEmpty {
                    Text("No other subject of the same kind to merge into.").foregroundStyle(.secondary)
                }

                ForEach(candidates) { subject in
                    Button { chosen = subject } label: {
                        Text(subject.name).foregroundStyle(.primary)
                    }
                    .disabled(isMerging)
                }
            }
            .navigationTitle("Merge into which subject?")
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .confirmationDialog(
                "Merge \(source.name) into \(chosen?.name ?? "")? All of \(source.name)'s subjects move to \(chosen?.name ?? "") and \(source.name) is deleted.",
                isPresented: Binding(get: { chosen != nil }, set: { if !$0 { chosen = nil } }),
                titleVisibility: .visible
            ) {
                Button("Merge", role: .destructive) {
                    guard let target = chosen else { return }

                    Task {
                        isMerging = true
                        errorMessage = nil

                        if let failure = await onMerge(target) {
                            errorMessage = failure
                        } else {
                            dismiss()
                        }

                        isMerging = false
                    }
                }
                Button("Cancel", role: .cancel) { chosen = nil }
            }
        }
    }
}

enum SheetFailure {
    static func message(_ succeeded: Bool, _ detail: String?) -> String? {
        succeeded ? nil : (detail ?? "Couldn't save. Try again.")
    }
}

struct SheetErrorText: View {
    let message: String?

    var body: some View {
        if let message {
            Text(message).zoomFont(.caption).foregroundStyle(.red)
        }
    }
}
