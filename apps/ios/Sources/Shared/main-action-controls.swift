import SwiftUI

enum MainActionStyle {
    case normal
    case prominent
    case destructive
}

struct MainActionTile {
    let title: String
    var style = MainActionStyle.normal
    var isLoading = false
    var isDisabled = false
    var tint: Color?
    var shortcut: KeyboardShortcut?
    let action: () -> Void
}

struct MainActionControls: View {
    static let minHeight: CGFloat = 60

    let tiles: [MainActionTile]
    var extendsIntoBottomSafeArea = false

    var body: some View {
        VStack(spacing: 0) {
            Divider()

            HStack(spacing: 0) {
                ForEach(Array(tiles.enumerated()), id: \.offset) { index, tile in
                    if index > 0 { Divider() }

                    MainActionTileView(tile: tile)
                }
            }
            .frame(minHeight: Self.minHeight)
            .fixedSize(horizontal: false, vertical: true)
        }
        .background(.bar, ignoresSafeAreaEdges: extendsIntoBottomSafeArea ? .bottom : [])
    }
}

private struct MainActionTileView: View {
    let tile: MainActionTile

    private var foreground: Color {
        if let tint = tile.tint { return tint }

        switch tile.style {
        case .normal: return .primary
        case .prominent: return .white
        case .destructive: return .red
        }
    }

    private var background: Color {
        if let tint = tile.tint { return tint.opacity(0.15) }

        return tile.style == .prominent ? .accentColor : .clear
    }

    var body: some View {
        Button(action: tile.action) {
            ZStack {
                Text(tile.title)
                    .zoomFont(.headline)
                    .opacity(tile.isLoading ? 0 : 1)

                if tile.isLoading { ProgressView() }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.vertical, 8)
            .foregroundStyle(foreground)
            .background(background)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .optionalShortcut(tile.shortcut)
        .disabled(tile.isDisabled || tile.isLoading)
        .opacity(tile.isDisabled ? 0.4 : 1)
        .accessibilityLabel(tile.title)
    }
}

private extension View {
    @ViewBuilder
    func optionalShortcut(_ shortcut: KeyboardShortcut?) -> some View {
        if let shortcut {
            keyboardShortcut(shortcut)
        } else {
            self
        }
    }
}

extension View {
    func mainActionControls(_ tiles: [MainActionTile]) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            MainActionControls(tiles: tiles)
        }
    }
}
