import SwiftUI

struct CardTextArea: View {
    let label: String
    @Binding var text: String
    var minHeight: CGFloat = 100

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .zoomFont(.caption)
                .foregroundStyle(.secondary)

            ZStack(alignment: .topLeading) {
                Text(text + "\n")
                    .padding(.horizontal, 5)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .opacity(0)
                    .accessibilityHidden(true)

                TextEditor(text: $text)
                    .scrollContentBackground(.hidden)
                    .scrollDisabled(true)
                    .accessibilityLabel(label)
            }
            .frame(minHeight: minHeight, alignment: .topLeading)
            .padding(6)
            .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .padding(.vertical, 4)
    }
}
