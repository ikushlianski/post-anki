import PostAnkiAPI
import SwiftUI

struct SubjectDuplicateList: View {
    let model: DuplicateReviewModel

    @State private var pending: (pair: SubjectDuplicateSuggestion, keepId: String)?

    var body: some View {
        if model.hasLoaded && model.subjectPairs.isEmpty {
            Text("No possible duplicate subjects.").foregroundStyle(.secondary)
        }

        ForEach(model.subjectPairs) { pair in
            ZoomVStack(alignment: .leading, spacing: 6) {
                Text("\(model.subjectName(pair.subjectAId)) and \(model.subjectName(pair.subjectBId))")
                    .zoomFont(.headline)

                Text("\(Int((pair.similarity * 100).rounded()))% similar")
                    .zoomFont(.subheadline)

                Text(pair.reason).zoomFont(.caption).foregroundStyle(.secondary)

                Button("Keep \(model.subjectName(pair.subjectAId))") { pending = (pair, pair.subjectAId) }
                    .buttonStyle(.bordered)

                Button("Keep \(model.subjectName(pair.subjectBId))") { pending = (pair, pair.subjectBId) }
                    .buttonStyle(.bordered)

                Button("Not duplicates") { Task { await model.resolveSubject(pair, keep: nil) } }
                    .buttonStyle(.bordered)
            }
            #if os(macOS)
            .contextMenu {
                Button("Keep \(model.subjectName(pair.subjectAId))") { pending = (pair, pair.subjectAId) }
                Button("Keep \(model.subjectName(pair.subjectBId))") { pending = (pair, pair.subjectBId) }
                Button("Not duplicates") { Task { await model.resolveSubject(pair, keep: nil) } }
            }
            #endif
            .confirmationDialog(
                confirmTitle,
                isPresented: Binding(
                    get: { pending?.pair.id == pair.id },
                    set: { if !$0 && pending?.pair.id == pair.id { pending = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("Merge", role: .destructive) {
                    guard let pending, pending.pair.id == pair.id else { return }

                    Task { await model.resolveSubject(pending.pair, keep: pending.keepId) }
                }
            }
        }
    }

    private var confirmTitle: String {
        guard let pending else { return "" }

        let otherId = pending.keepId == pending.pair.subjectAId ? pending.pair.subjectBId : pending.pair.subjectAId
        let other = model.subjectName(otherId)

        return "Merge \(other) into \(model.subjectName(pending.keepId))? Its courses move over and \(other) is deleted."
    }
}
