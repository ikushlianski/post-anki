import PostAnkiAPI
import SwiftUI

enum TargetPhrases {
    static let maxCount = 5
    static let maxLength = 200

    static func isEnglish(subjectId: String?, subjects: [Subject]) -> Bool {
        var currentId = subjectId
        var visited = Set<String>()

        while let id = currentId, visited.insert(id).inserted, let subject = subjects.first(where: { $0.id == id }) {
            if subject.parentId == nil {
                return subject.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "english"
            }

            currentId = subject.parentId
        }

        return false
    }

    static func cleaned(_ phrases: [String]) -> [String] {
        var seen = Set<String>()
        var result: [String] = []

        for phrase in phrases {
            let trimmed = String(phrase.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxLength))

            guard !trimmed.isEmpty, seen.insert(trimmed.lowercased()).inserted else { continue }

            result.append(trimmed)

            if result.count == maxCount { break }
        }

        return result
    }
}

struct TargetPhrasesSection: View {
    @Binding var phrases: [String]
    @Binding var isExpanded: Bool

    var body: some View {
        DisclosureGroup("Practise phrases", isExpanded: $isExpanded) {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(phrases.indices, id: \.self) { index in
                    HStack {
                        TextField("Phrase to practise", text: binding(at: index))
                            .textFieldStyle(.roundedBorder)

                        Button {
                            remove(at: index)
                        } label: {
                            Image(systemName: "minus.circle")
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel("Remove target phrase")
                    }
                }

                if phrases.count < TargetPhrases.maxCount {
                    Button("Add target phrase") { phrases.append("") }
                        .buttonStyle(.borderless)
                }
            }
            .padding(.top, 8)
        }
        .padding(14)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func binding(at index: Int) -> Binding<String> {
        Binding(
            get: { phrases.indices.contains(index) ? phrases[index] : "" },
            set: { value in
                guard phrases.indices.contains(index) else { return }

                phrases[index] = String(value.prefix(TargetPhrases.maxLength))
            }
        )
    }

    private func remove(at index: Int) {
        guard phrases.indices.contains(index) else { return }

        phrases.remove(at: index)

        if phrases.isEmpty { phrases = [""] }
    }
}
