import PostAnkiAPI
import SwiftUI

struct MacWritingCheckView: View {
    @Environment(\.zoomScale) private var zoomScale

    private var zoom: CGFloat { CGFloat(zoomScale) }

    @State private var model: WritingCheckModel

    init(subject: PracticeSubject) {
        _model = State(initialValue: WritingCheckModel(subjectId: subject.id, drafts: .shared))
    }

    var body: some View {
        @Bindable var model = model

        List {
            Section {
                TextEditor(text: $model.text)
                    .zoomFont(.body)
                    .frame(minHeight: 140 * zoom)

                Text("\(model.text.count)/\(WritingCheckModel.maxLength)")
                    .zoomFont(.caption)
                    .foregroundStyle(model.text.count > WritingCheckModel.maxLength ? .red : .secondary)

                if model.draftClipped { DraftClippedNote() }

                HStack {
                    Button {
                        Task { await model.check() }
                    } label: {
                        if model.isChecking { ProgressView().controlSize(.small) } else { Text("Check") }
                    }
                    .keyboardShortcut(.return, modifiers: .command)
                    .disabled(!model.canCheck)

                    Text("Cmd-Return to check").zoomFont(.caption).foregroundStyle(.secondary)
                }

                if let message = model.errorMessage {
                    Text(message).foregroundStyle(.red)
                    Button("Try again") { Task { await model.retry() } }
                }
            }

            if let latest = model.latest {
                Section("Result") { WritingCheckResult(check: latest) }
            }

            if !model.history.isEmpty {
                Section("Past checks") {
                    ForEach(model.history) { check in
                        DisclosureGroup {
                            WritingCheckResult(check: check)
                        } label: {
                            Text(check.text).lineLimit(2)
                        }
                    }
                }
            }
        }
        .navigationTitle("Check my writing")
        .onChange(of: model.text) { model.saveDraft() }
        .reportsUnsentInput("writing-check", model.hasInput)
        .toolbar {
            ToolbarItem {
                MacReloadButton(isDisabled: model.isLoading) { Task { await model.loadHistory() } }
            }
        }
        .task { await model.loadHistory() }
    }
}
