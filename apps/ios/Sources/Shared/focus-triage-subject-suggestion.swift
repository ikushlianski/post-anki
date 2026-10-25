import PostAnkiAPI
import SwiftUI

struct FocusTriageSubjectSuggestion: View {
    let bit: PendingReviewBit
    let source: PendingReviewSource?

    @State private var subjects: [Subject] = []
    @State private var movedTo: String?
    @State private var isMoving = false
    @State private var failed = false

    var body: some View {
        if let movedTo {
            Label("Moved to \(movedTo)", systemImage: "checkmark.circle")
                .zoomFont(.caption)
                .foregroundStyle(.secondary)
        } else if let suggestion = source?.subjectSuggestion {
            HStack(spacing: 8) {
                Text("Suggested: \(suggestion.name)")
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                Button("Accept") { move(to: suggestion.id, name: suggestion.name) }
                    .buttonStyle(.bordered)
                    .controlSize(.mini)

                Menu("Other") {
                    ForEach(subjects.filter { $0.id != suggestion.id }) { subject in
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
