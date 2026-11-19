import SwiftUI

struct DueReviewGradeBar: View {
    @AppStorage(AnswerButtonSizeStore.key) private var sizeRaw = AnswerButtonSize.defaultSize.rawValue

    static let verticalPadding: CGFloat = 12

    let tiles: [MainActionTile]

    private var isCompact: Bool { tiles.count > 4 }

    var body: some View {
        VStack(spacing: 0) {
            Divider()

            HStack(spacing: isCompact ? 6 : AnswerButtonLayout.spacing) {
                ForEach(Array(tiles.enumerated()), id: \.offset) { _, tile in
                    DueReviewGradeBarButton(
                        tile: tile,
                        height: max((AnswerButtonSize(rawValue: sizeRaw) ?? .defaultSize).height, AnswerButtonLayout.minHeight),
                        isCompact: isCompact
                    )
                }
            }
            .padding(.horizontal, isCompact ? 8 : 12)
            .padding(.vertical, Self.verticalPadding)
        }
        .background(.bar)
    }
}

private struct DueReviewGradeBarButton: View {
    let tile: MainActionTile
    let height: CGFloat
    let isCompact: Bool

    private var tint: Color { tile.tint ?? .accentColor }
    private var isProminent: Bool { tile.style == .prominent }
    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: AnswerButtonLayout.cornerRadius, style: .continuous) }

    var body: some View {
        Button(action: tile.action) {
            VStack(spacing: 2) {
                Text(tile.title)
                    .zoomFont(isCompact ? .callout : .title3)
                    .fontWeight(.bold)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)

                if let systemImage = tile.systemImage {
                    Image(systemName: systemImage)
                        .zoomFont(.footnote)
                } else if let caption = tile.caption {
                    Text(caption)
                        .zoomFont(.footnote)
                        .fontWeight(.semibold)
                        .opacity(0.8)
                        .monospacedDigit()
                }
            }
            .frame(maxWidth: .infinity, minHeight: max(height, 44), maxHeight: .infinity)
            .foregroundStyle(isProminent ? Color.white : .primary)
            .background(isProminent ? tint : tint.opacity(0.28), in: shape)
            .overlay(shape.strokeBorder(tint, lineWidth: 1.5))
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .disabled(tile.isDisabled)
        .opacity(tile.isDisabled ? 0.4 : 1)
        .accessibilityLabel(tile.identifier == "due-review-known" ? "I already know it" : tile.caption.map { "\(tile.title), next in \($0)" } ?? tile.title)
        .accessibilityIdentifier(tile.identifier ?? "")
    }
}
