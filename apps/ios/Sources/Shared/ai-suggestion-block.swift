import SwiftUI

enum AiSuggestionText {
    static func shown(_ suggestion: String?, original: String?) -> (original: String, suggestion: String)? {
        let text = suggestion?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let source = original?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        guard !text.isEmpty, !source.isEmpty else { return nil }

        return (source, text)
    }
}

struct AiSuggestionBlock: View {
    let suggestion: String?
    let original: String?

    var body: some View {
        if let shown = AiSuggestionText.shown(suggestion, original: original) {
            ZoomVStack(alignment: .leading, spacing: 6) {
                labeled("Your phrase", shown.original)

                ZoomHStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("AI")
                        .zoomFont(.caption2.weight(.bold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.indigo.opacity(0.15), in: Capsule())
                        .foregroundStyle(Color.indigo)
                        .accessibilityLabel("AI generated")

                    labeled("AI suggestion", shown.suggestion)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .textSelection(.enabled)
        }
    }

    private func labeled(_ title: String, _ value: String) -> some View {
        Text("\(Text("\(title): ").foregroundStyle(.secondary).fontWeight(.medium))\(value)")
            .zoomFont(.callout)
    }
}
