import SwiftUI

struct DueReviewGradeBar: View {
    @AppStorage(AnswerButtonSizeStore.key) private var sizeRaw = AnswerButtonSize.defaultSize.rawValue

    let tiles: [MainActionTile]

    var body: some View {
        VStack(spacing: 0) {
            Divider()

            HStack(spacing: AnswerButtonLayout.spacing) {
                ForEach(Array(tiles.enumerated()), id: \.offset) { _, tile in
                    DueReviewGradeBarButton(tile: tile, height: max((AnswerButtonSize(rawValue: sizeRaw) ?? .defaultSize).height, AnswerButtonLayout.minHeight))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
        }
        .background(.bar)
    }
}

private struct DueReviewGradeBarButton: View {
    let tile: MainActionTile
    let height: CGFloat

    private var tint: Color { tile.tint ?? .accentColor }
    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: AnswerButtonLayout.cornerRadius, style: .continuous) }

    var body: some View {
        Button(action: tile.action) {
            VStack(spacing: 2) {
                Text(tile.title)
                    .zoomFont(.title3)
                    .fontWeight(.bold)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                if let caption = tile.caption {
                    Text(caption)
                        .zoomFont(.footnote)
                        .fontWeight(.semibold)
                        .opacity(0.8)
                        .monospacedDigit()
                }
            }
            .frame(maxWidth: .infinity, minHeight: max(height, 44))
            .foregroundStyle(.primary)
            .background(tint.opacity(0.28), in: shape)
            .overlay(shape.strokeBorder(tint, lineWidth: 1.5))
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .disabled(tile.isDisabled)
        .opacity(tile.isDisabled ? 0.4 : 1)
        .accessibilityLabel(tile.caption.map { "\(tile.title), next in \($0)" } ?? tile.title)
        .accessibilityIdentifier(tile.identifier ?? "")
    }
}
