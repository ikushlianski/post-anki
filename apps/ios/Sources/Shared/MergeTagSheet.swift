import PostAnkiAPI
import SwiftUI

struct MergeTagSheet: View {
    let source: Tag
    let candidates: [Tag]
    let onMerge: (Tag) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var chosen: Tag?
    @State private var isMerging = false

    var body: some View {
        NavigationStack {
            List(candidates.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }) { tag in
                Button {
                    chosen = tag
                } label: {
                    Text(tag.name).foregroundStyle(.primary)
                }
                .disabled(isMerging)
            }
            .navigationTitle("Keep which tag?")
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .confirmationDialog(
                "Merge \(source.name) into \(chosen?.name ?? "")? \(source.name) is removed.",
                isPresented: Binding(get: { chosen != nil }, set: { if !$0 { chosen = nil } }),
                titleVisibility: .visible
            ) {
                Button("Merge", role: .destructive) {
                    guard let target = chosen else { return }

                    Task {
                        isMerging = true
                        _ = await onMerge(target)
                        isMerging = false
                        dismiss()
                    }
                }
                Button("Cancel", role: .cancel) { chosen = nil }
            }
        }
    }
}
