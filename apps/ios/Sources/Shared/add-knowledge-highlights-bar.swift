import PostAnkiAPI
import SwiftUI

struct AddKnowledgeHighlightsBar: View {
    let text: String
    let selection: NSRange
    @Binding var highlights: [KnowledgeHighlight]

    private var canHighlight: Bool {
        selection.length > 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Button("Highlight selection", systemImage: "highlighter") { highlightSelection() }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .disabled(!canHighlight)
                    .accessibilityIdentifier("add-knowledge-highlight")

                if !highlights.isEmpty {
                    Button("Clear highlights") { highlights = [] }
                        .buttonStyle(.borderless)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("add-knowledge-highlights-clear")
                }

                if highlights.count >= KnowledgeHighlights.max {
                    Text("Up to \(KnowledgeHighlights.max) highlights.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Text("Highlight the parts the AI should focus on when writing questions.")
                .font(.caption)
                .foregroundStyle(.secondary)

            ForEach(Array(highlights.enumerated()), id: \.element) { index, range in
                HStack(spacing: 6) {
                    Text(KnowledgeHighlights.excerpt(of: text, range))
                        .font(.caption)
                        .lineLimit(1)

                    Button("Remove highlight", systemImage: "xmark.circle.fill") { highlights.remove(at: index) }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.borderless)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Color.yellow.opacity(0.25), in: Capsule())
            }
        }
    }

    private func highlightSelection() {
        let range = KnowledgeHighlight(start: selection.location, end: selection.location + selection.length)

        highlights = KnowledgeHighlights.adding(range, to: highlights, textLength: text.utf16.count)
    }
}
