import SwiftUI

struct TriageExampleBlock: View {
    let text: String
    var isAI = false

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 6) {
            ZoomHStack(spacing: 6) {
                Text(isAI ? "AI examples" : "Examples")
                    .zoomFont(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            Text(text)
                .zoomFont(.body)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
                .copyMenu(text)
        }
        .zoomPadding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(isAI ? "AI example: \(text)" : "Example: \(text)")
    }
}
