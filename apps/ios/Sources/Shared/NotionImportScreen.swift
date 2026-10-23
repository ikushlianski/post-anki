import SwiftUI

struct NotionImportScreen: View {
    @State private var model = NotionImportModel()

    var body: some View {
        Form {
            Section {
                TextField("Notion database id", text: $model.input, axis: .vertical)
                    .plainTextInput()
                    .autocorrectionDisabled()
                    .disabled(model.isRunning)
            } footer: {
                Text("Open the database in Notion, copy its link, and paste the id (the 32-character part).")
            }

            Section {
                Button("Import") { Task { await model.start() } }
                    .disabled(!model.canImport)

                if model.isRunning {
                    HStack {
                        ProgressView()
                        Text("Importing from Notion...")
                    }
                }
            }

            if let errorMessage = model.errorMessage {
                Section { Text(errorMessage).foregroundStyle(.red) }
            }

            if model.nextCursor != nil {
                Section {
                    Text("Imported \(model.imported) so far.")

                    Button("Continue import") { Task { await model.continueImport() } }
                        .disabled(!model.canContinue)
                }
            } else if let finished = model.finishedMessage {
                Section {
                    if model.imported > 0 { Text("Imported \(model.imported) new items.") }
                    Text(finished).foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Import from Notion")
        .inlineNavigationTitle()
    }
}
