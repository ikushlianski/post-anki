import PostAnkiAPI
import SwiftUI

struct CourseBuildSourcesSection: View {
    let model: CourseBuildModel
    let sources: [CourseBuildSource]

    @State private var removing: CourseBuildSource?
    @State private var newLink = ""

    private var trimmedLink: String { newLink.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        Section("Sources found") {
            if sources.isEmpty {
                Text("No sources yet.").foregroundStyle(.secondary)
            }

            ForEach(sources) { source in
                VStack(alignment: .leading, spacing: 2) {
                    Text(source.title ?? source.value).lineLimit(2)

                    Text(source.isApproved ? "Approved" : "Waiting for approval")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .swipeActions {
                    Button("Remove", role: .destructive) { removing = source }
                }
            }
        }

        Section("Add a link") {
            TextField("https://...", text: $newLink)
                .urlTextInput()
                .autocorrectionDisabled()

            Button("Add link") {
                let link = trimmedLink

                Task {
                    if await model.addLink(link) { newLink = "" }
                }
            }
            .disabled(trimmedLink.isEmpty)
        }

        Section {
            Button("Approve sources") { Task { await model.approveSources() } }

            if model.allowOverride {
                Button("Continue without sources") { Task { await model.approveSources(override: true) } }
            }
        }
        .confirmationDialog(
            "Remove \(removing?.title ?? removing?.value ?? "this source")?",
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            titleVisibility: .visible
        ) {
            Button("Remove", role: .destructive) {
                guard let source = removing else { return }

                removing = nil
                Task { await model.removeSource(source) }
            }
            Button("Cancel", role: .cancel) { removing = nil }
        }
    }
}
