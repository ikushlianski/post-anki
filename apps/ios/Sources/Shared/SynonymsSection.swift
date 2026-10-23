import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class SynonymsModel {
    let bitId: String
    let question: String
    var synonyms: [KnowledgeBitVariant] = []

    init(bitId: String, question: String) {
        self.bitId = bitId
        self.question = question
    }

    func load() async {
        guard let variants = try? await APIClient.knowledgeBitVariants(bitId: bitId) else { return }

        synonyms = variants.filter { $0.prompt != question }
    }
}

struct SynonymsSection: View {
    @State private var model: SynonymsModel

    init(bitId: String, question: String) {
        _model = State(initialValue: SynonymsModel(bitId: bitId, question: question))
    }

    var body: some View {
        Group {
            if !model.synonyms.isEmpty {
                Section("Synonyms") {
                    ForEach(model.synonyms) { synonym in
                        ZoomVStack(alignment: .leading, spacing: 4) {
                            Text(synonym.prompt)

                            Text(synonym.answer)
                                .zoomFont(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .task { await model.load() }
    }
}
