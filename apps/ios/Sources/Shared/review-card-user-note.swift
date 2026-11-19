import PostAnkiAPI
import SwiftUI

struct ReviewCardUserNote: View {
    let bitId: String
    @State private var saved: String?
    @State private var draft: String?
    @State private var isSaving = false
    @State private var failed = false

    init(bitId: String, note: String?) {
        self.bitId = bitId
        _saved = State(initialValue: (note ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : note)
    }

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 6) {
            if draft != nil {
                Text("My note")
                    .zoomFont(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                TextEditor(text: Binding(get: { draft ?? "" }, set: { draft = String($0.prefix(UserNote.maxLength)) }))
                    .zoomFont(.subheadline)
                    .frame(minHeight: 80)
                    .accessibilityIdentifier("review-card-note-input")

                if failed {
                    Text("Could not save your note. Try again.")
                        .zoomFont(.footnote)
                        .foregroundStyle(.red)
                }

                ZoomHStack(spacing: 12) {
                    Button("Save note") { Task { await save() } }
                        .buttonStyle(.bordered)
                        .disabled(isSaving)

                    Button("Cancel") {
                        draft = nil
                        failed = false
                    }
                    .disabled(isSaving)
                }
            } else {
                if let saved {
                    Text(saved)
                        .zoomFont(.subheadline)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                        .accessibilityIdentifier("review-card-note")
                }

                Button(saved == nil ? "Add note" : "Edit note") { draft = saved ?? "" }
                    .zoomFont(.footnote)
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("review-card-note-edit")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func save() async {
        guard let text = draft else { return }

        isSaving = true
        failed = false
        defer { isSaving = false }

        do {
            saved = try await APIClient.setKnowledgeBitUserNote(bitId: bitId, note: text)
            draft = nil
        } catch {
            failed = true
        }
    }
}
