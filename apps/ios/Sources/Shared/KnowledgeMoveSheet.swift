import PostAnkiAPI
import SwiftUI

struct KnowledgeMoveSheet: View {
    let subjects: [Subject]
    var excludedId: String?
    var loadFailureMessage: String?
    var onRetry: (() -> Void)?
    let onPick: (Subject) -> Void
    @Environment(\.dismiss) private var dismiss

    private var options: [SubjectPathOption] {
        SubjectTreePath.options(from: subjects).filter { $0.id != excludedId }
    }

    var body: some View {
        NavigationStack {
            List(options) { option in
                Button(option.label) {
                    if let subject = subjects.first(where: { $0.id == option.id }) {
                        onPick(subject)
                        dismiss()
                    }
                }
                .disabled(option.isParent)
            }
            .navigationTitle("Move to subject")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .overlay {
                if let loadFailureMessage, subjects.isEmpty {
                    ContentUnavailableView {
                        Label("Couldn't load subjects", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(loadFailureMessage)
                    } actions: {
                        if let onRetry { Button("Retry", action: onRetry) }
                    }
                } else if subjects.isEmpty {
                    ContentUnavailableView("No subjects", systemImage: "folder")
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 320, minHeight: 360)
        #endif
    }
}
