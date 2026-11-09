import PostAnkiAPI
import SwiftUI

struct FocusTriageSubjectSuggestion: View {
    let bit: PendingReviewBit
    let source: PendingReviewSource?

    @State private var changeModel: FocusTriageSubjectChangeModel?
    @State private var isPickerPresented = false
    @State private var movedTo: String?
    @State private var isMoving = false
    @State private var failed = false

    @State private var confirmed = false

    var body: some View {
        if let movedTo {
            row(label: "Subject: \(movedTo)", primary: nil, menuTitle: "Change", excluding: nil)
        } else if confirmed {
            Label("Subject confirmed", systemImage: "checkmark.circle")
                .zoomFont(.caption)
                .foregroundStyle(.secondary)
        } else if let suggestion = source?.subjectSuggestion {
            row(label: "Suggested: \(suggestion.name)", primary: ("Accept", { move(to: suggestion.id, name: suggestion.name) }), menuTitle: "Other", excluding: suggestion.id)
        } else if let current = source?.subjectName, source?.subjectId != nil {
            row(label: "Subject: \(current)", primary: ("Looks right", { confirmed = true }), menuTitle: "Reassign", excluding: source?.subjectId)
        } else {
            row(label: "No subject", primary: nil, menuTitle: "Assign subject", excluding: nil)
        }
    }

    private func row(label: String, primary: (String, () -> Void)?, menuTitle: String, excluding: String?) -> some View {
        HStack(spacing: 8) {
            Text(label)
                .zoomFont(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .textSelection(.enabled)

            if let primary {
                Button(primary.0, action: primary.1)
                    .buttonStyle(.bordered)
                    .controlSize(.mini)
            }

            Button(menuTitle) {
                changeModel = changeModel ?? FocusTriageSubjectChangeModel(bitId: bit.id)
                isPickerPresented = true
            }
            .buttonStyle(.bordered)
            .controlSize(.mini)
            .accessibilityIdentifier("triage-change-subject")

            if failed {
                Text("Couldn't save")
                    .zoomFont(.caption)
                    .foregroundStyle(.red)
            }
        }
        .disabled(isMoving)
        .sheet(isPresented: $isPickerPresented) {
            if let changeModel {
                FocusTriageSubjectSheet(model: changeModel, currentId: excluding) { label in
                    movedTo = label
                    failed = false
                }
            }
        }
    }

    private func move(to subjectId: String, name: String) {
        isMoving = true
        failed = false

        Task {
            do {
                let result = try await APIClient.moveKnowledgeBits(ids: [bit.id], subjectId: subjectId)

                if result.moved.contains(bit.id) {
                    movedTo = name
                } else {
                    failed = true
                }
            } catch {
                failed = true
            }

            isMoving = false
        }
    }
}
