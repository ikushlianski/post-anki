import PostAnkiAPI
import SwiftUI

enum AddKnowledgeComposerSummary {
    static func kindLabel(for raw: String) -> String? {
        switch AddKnowledgeInput.classify(raw) {
        case .url: "Link"
        case .text: "Text"
        case .none: nil
        }
    }

    static func wordCount(_ raw: String) -> Int {
        raw.split(whereSeparator: \.isWhitespace).count
    }
}

struct AddKnowledgeComposer: View {
    @Binding var text: String
    @Binding var highlights: [KnowledgeHighlight]
    var title: String?
    var failure: String?
    var canAddAnyway = false
    var onAddAnyway: () -> Void = {}
    var onRemove: (() -> Void)?
    @FocusState private var isFocused: Bool
    @State private var selection = NSRange(location: 0, length: 0)

    private var kind: String? { AddKnowledgeComposerSummary.kindLabel(for: text) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title ?? "What do you want to remember?")
                    .font(.headline)

                Spacer()

                if let onRemove {
                    Button("Remove", systemImage: "trash", action: onRemove)
                        .labelStyle(.titleAndIcon)
                        .buttonStyle(.borderless)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("add-knowledge-remove-piece")
                }
            }

            editor

            if kind == "Text" {
                AddKnowledgeHighlightsBar(text: text, selection: selection, highlights: $highlights, isShortcutActive: isFocused)
            }

            AddKnowledgeComposerFooter(text: $text)

            if let failure {
                Label(failure, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("add-knowledge-piece-failure")

                if canAddAnyway {
                    Button("Add anyway", action: onAddAnyway)
                        .font(.caption)
                }
            }
        }
        .padding(14)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var editor: some View {
        HighlightableTextEditor(text: $text, selection: $selection, highlights: highlights)
            .focused($isFocused)
            .frame(minHeight: 240)
            .padding(10)
            .background(.background, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(isFocused ? Color.accentColor : Color.secondary.opacity(0.25), lineWidth: isFocused ? 2 : 1)
            }
            .overlay(alignment: .topLeading) {
                if text.isEmpty {
                    Text(AddKnowledgeInput.placeholder)
                        .font(.system(size: 16))
                        .foregroundStyle(.tertiary)
                        .padding(.top, 18)
                        .padding(.leading, 15)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            }
            .animation(.easeOut(duration: 0.15), value: isFocused)
    }
}
