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
    var isSubmitting = false
    var onSubmit: () -> Void = {}
    @FocusState private var isFocused: Bool
    @State private var selection = NSRange(location: 0, length: 0)

    private var kind: String? { AddKnowledgeComposerSummary.kindLabel(for: text) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("What do you want to remember?")
                .font(.headline)

            editor

            if kind == "Text" {
                AddKnowledgeHighlightsBar(text: text, selection: selection, highlights: $highlights)
            }

            AddKnowledgeComposerFooter(text: $text)

            submitButton
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

    private var submitButton: some View {
        Button(action: onSubmit) {
            ZStack {
                Text("Submit").font(.headline).opacity(isSubmitting ? 0 : 1)

                if isSubmitting { ProgressView().controlSize(.small) }
            }
            .frame(maxWidth: .infinity, minHeight: 32)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(isSubmitting || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        .optionalSubmitShortcut()
        .accessibilityIdentifier("add-knowledge-submit")
    }
}

private extension View {
    @ViewBuilder
    func optionalSubmitShortcut() -> some View {
        #if os(macOS)
        keyboardShortcut(.return, modifiers: .command)
        #else
        self
        #endif
    }
}
