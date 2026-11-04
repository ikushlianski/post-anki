import PostAnkiAPI
import SwiftUI
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

enum CopyToPasteboard {
    static func copy(_ text: String) {
        #if canImport(UIKit)
        UIPasteboard.general.string = text
        #elseif canImport(AppKit)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #endif
    }
}

enum CardCopyText {
    static func card(question: String?, answer: String?) -> String {
        [question, answer]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")
    }
}

extension CardCopyText {
    static func aiSuggestion(_ suggestion: String?, original: String?) -> [String?] {
        guard let shown = AiSuggestionText.shown(suggestion, original: original) else { return [] }

        return ["Your phrase: \(shown.original)", "AI suggestion: \(shown.suggestion)"]
    }

    static func triageParts(_ parts: FocusTriageCardParts, suggestion: String?, original: String?) -> [String?] {
        [parts.context, parts.front, parts.back] + aiSuggestion(suggestion, original: original) + [parts.example]
    }

    static func reviewParts(_ card: ReviewCard) -> [String?] {
        [card.face.context, card.face.front, card.filledSentence ?? card.answer]
            + aiSuggestion(card.aiSuggestion, original: card.originalPhrase)
            + [card.background]
    }

    static func all(_ parts: [String?]) -> String {
        parts
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")
    }
}

struct CopyAllButton: View {
    let parts: [String?]
    @State private var copied = false

    var body: some View {
        Button(copied ? "Copied" : "Copy all", systemImage: "doc.on.doc") {
            CopyToPasteboard.copy(CardCopyText.all(parts))
            copied = true

            Task {
                try? await Task.sleep(for: .seconds(1.5))
                copied = false
            }
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .disabled(CardCopyText.all(parts).isEmpty)
    }
}

extension View {
    func copyMenu(_ text: String?, label: String = "Copy") -> some View {
        contextMenu {
            if let text, !text.isEmpty {
                Button(label, systemImage: "doc.on.doc") { CopyToPasteboard.copy(text) }
            }
        }
    }

    func cardCopyMenu(question: String?, answer: String?) -> some View {
        contextMenu {
            if let question, !question.isEmpty {
                Button("Copy question", systemImage: "doc.on.doc") { CopyToPasteboard.copy(question) }
            }

            if let answer, !answer.isEmpty {
                Button("Copy answer", systemImage: "doc.on.doc") { CopyToPasteboard.copy(answer) }
            }

            Button("Copy card", systemImage: "doc.on.doc.fill") {
                CopyToPasteboard.copy(CardCopyText.card(question: question, answer: answer))
            }
        }
    }
}
