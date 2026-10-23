import PostAnkiAPI
import SwiftUI

struct KnowledgeMoveSheet: View {
    let subjects: [Subject]
    let onPick: (Subject) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(subjects) { subject in
                Button(subject.name) {
                    onPick(subject)
                    dismiss()
                }
            }
            .navigationTitle("Move to subject")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .overlay {
                if subjects.isEmpty { ContentUnavailableView("No subjects", systemImage: "folder") }
            }
        }
        #if os(macOS)
        .frame(minWidth: 320, minHeight: 360)
        #endif
    }
}
