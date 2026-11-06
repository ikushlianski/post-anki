import PostAnkiAPI
import SwiftUI

struct FocusTriageSubjectSuggestion: View {
    let bit: PendingReviewBit
    let source: PendingReviewSource?

    @State private var subjects: [Subject] = []
    @State private var movedTo: String?
    @State private var isMoving = false
    @State private var failed = false

    @State private var confirmed = false

    var body: some View {
        if let movedTo {
            Label("Moved to \(movedTo)", systemImage: "checkmark.circle")
                .zoomFont(.caption)
                .foregroundStyle(.secondary)
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

            Menu(menuTitle) {
                ForEach(subjects.filter { $0.id != excluding }) { subject in
                    Button(subject.name) { move(to: subject.id, name: subject.name) }
                }
            }
            .controlSize(.mini)
            .disabled(subjects.isEmpty)

            if failed {
                Text("Couldn't save")
                    .zoomFont(.caption)
                    .foregroundStyle(.red)
            }
        }
        .disabled(isMoving)
        .task { await loadSubjects() }
    }

    private func loadSubjects() async {
        guard subjects.isEmpty else { return }

        subjects = (try? await APIClient.listSubjects()) ?? []
    }

    private func move(to subjectId: String, name: String) {
        isMoving = true
        failed = false

        Task {
            do {
                _ = try await APIClient.moveKnowledgeBits(ids: [bit.id], subjectId: subjectId)
                movedTo = name
            } catch {
                failed = true
            }

            isMoving = false
        }
    }
}
