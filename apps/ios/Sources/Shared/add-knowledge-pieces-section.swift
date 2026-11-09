import PostAnkiAPI
import SwiftUI

struct AddKnowledgePiecesSection: View {
    @Bindable var model: IngestionDictationScreenModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(model.pieces.enumerated()), id: \.element.id) { position, piece in
                AddKnowledgeComposer(
                    text: Binding(get: { piece.text }, set: { model.setText($0, for: piece.id) }),
                    highlights: field(piece.id, \.highlights, []),
                    title: model.pieces.count > 1 ? "Piece \(position + 1)" : nil,
                    failure: piece.failure,
                    canAddAnyway: piece.canAddAnyway,
                    onAddAnyway: { Task { await model.addAnyway(pieceId: piece.id) } },
                    onRemove: position > 0 ? { model.removePiece(piece.id) } : nil
                )

                if model.showsTargetPhrases {
                    TargetPhrasesSection(phrases: field(piece.id, \.targetPhrases, [""]), isExpanded: $model.isPhrasesExpanded)
                }
            }

            Button("Add another piece", systemImage: "plus") { model.addPiece() }
                .buttonStyle(.bordered)
                .disabled(model.isSubmitting)
                .accessibilityIdentifier("add-knowledge-add-piece")
        }
    }

    private func field<Value>(_ id: UUID, _ keyPath: WritableKeyPath<AddKnowledgePiece, Value>, _ fallback: Value) -> Binding<Value> {
        Binding(
            get: { model.pieces.first { $0.id == id }?[keyPath: keyPath] ?? fallback },
            set: { value in
                guard let index = model.pieces.firstIndex(where: { $0.id == id }) else { return }

                model.pieces[index][keyPath: keyPath] = value
            }
        )
    }
}
