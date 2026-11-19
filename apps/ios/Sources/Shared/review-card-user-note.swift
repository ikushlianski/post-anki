import PostAnkiAPI
import SwiftUI

struct ReviewCardUserNote: View {
    let bitId: String
    @State private var saved: String?
    @State private var draft: String?
    @State private var isSaving = false
    @State private var failed = false
    private let onSaved: (String?) -> Void

    init(bitId: String, note: String?, startsEditing: Bool = false, onSaved: @escaping (String?) -> Void = { _ in }) {
        self.bitId = bitId
        self.onSaved = onSaved
        let existing = (note ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : note
        _saved = State(initialValue: existing)
        _draft = State(initialValue: startsEditing ? (existing ?? "") : nil)
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
            onSaved(saved)
        } catch {
            failed = true
        }
    }
}
