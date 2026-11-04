import SwiftUI

struct CardContextLine: View {
    let text: String?

    var body: some View {
        if let text, !text.isEmpty {
            Text(text)
                .zoomFont(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
                .accessibilityLabel("Context: \(text)")
        }
    }
}
