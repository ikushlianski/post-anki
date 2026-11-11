import SwiftUI

struct CardRichText<Plain: View>: View {
    let text: String
    var font: ZoomFont = .body
    var weight: Font.Weight?
    var foreground: HierarchicalShapeStyle = .primary
    @ViewBuilder let plain: () -> Plain

    var body: some View {
        if FencedCodeSplitter.hasFence(text) {
            segmented
        } else {
            plain()
        }
    }

    private var segmented: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(FencedCodeSplitter.split(text).enumerated()), id: \.offset) { _, segment in
                switch segment {
                case .prose(let prose):
                    Text(prose)
                        .zoomFont(weight.map { font.weight($0) } ?? font)
                        .foregroundStyle(foreground)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                case .code(let language, let code):
                    CodeBlockView(code: code, language: language)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
