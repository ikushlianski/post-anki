import PostAnkiAPI
import SwiftUI

#if os(macOS)
import AppKit
#endif

struct AddKnowledgeComposerFooter: View {
    @Binding var text: String

    private var kind: String? { AddKnowledgeComposerSummary.kindLabel(for: text) }

    var body: some View {
        HStack(spacing: 8) {
            if let kind {
                Label(kind, systemImage: kind == "Link" ? "link" : "text.alignleft")
                    .font(.caption.weight(.medium))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.accentColor.opacity(0.14), in: Capsule())
                    .foregroundStyle(Color.accentColor)

                if kind == "Text" {
                    Text("\(AddKnowledgeComposerSummary.wordCount(text)) words")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            if !text.isEmpty {
                Button("Clear", systemImage: "xmark.circle.fill") { text = "" }
                    .labelStyle(.titleAndIcon)
                    .buttonStyle(.borderless)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("add-knowledge-clear")
            }

            pasteButton
        }
    }

    @ViewBuilder
    private var pasteButton: some View {
        #if os(iOS)
        PasteButton(payloadType: String.self) { strings in
            guard let pasted = strings.first else { return }

            Task { @MainActor in text = AddKnowledgeDraft.pasting(pasted, into: text) }
        }
        .buttonBorderShape(.capsule)
        .accessibilityIdentifier("add-knowledge-paste")
        #else
        Button("Paste", systemImage: "doc.on.clipboard") {
            guard let pasted = NSPasteboard.general.string(forType: .string) else { return }

            text = AddKnowledgeDraft.pasting(pasted, into: text)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .accessibilityIdentifier("add-knowledge-paste")
        #endif
    }
}
