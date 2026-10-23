import PostAnkiAPI
import SwiftUI

struct CaptureLearningItemSheet: View {
    let subjects: [Subject]
    var initialURL = ""
    let onSaved: (LearningListItem) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var model = CaptureLearningItemModel()

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://...", text: $model.url)
                        .urlTextInput()
                        .autocorrectionDisabled()

                    Picker("Kind", selection: $model.kind) {
                        Text("Article").tag("article")
                        Text("Video").tag("video")
                    }
                    .pickerStyle(.segmented)

                    if model.needsDescription {
                        TextField("What is it about?", text: $model.description, axis: .vertical)
                            .lineLimit(2...5)
                    }

                    Picker("Subject", selection: $model.subjectId) {
                        ForEach(subjects) { subject in
                            Text(subject.name).tag(subject.id)
                        }
                    }
                }

                if model.isSaving {
                    Section {
                        HStack {
                            ProgressView()
                            Text("Reading the link...")
                        }
                    }
                }

                if let errorMessage = model.errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Save a link")
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(model.isSaving)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            if let item = await model.save() {
                                onSaved(item)
                                dismiss()
                            }
                        }
                    }
                    .disabled(!model.canSave)
                }
            }
            .interactiveDismissDisabled(model.isSaving)
            .onAppear {
                if model.url.isEmpty { model.url = initialURL }

                if model.subjectId.isEmpty, let first = subjects.first {
                    model.subjectId = first.id
                }
            }
        }
    }
}
