import SwiftUI
#if canImport(UIKit)
import UIKit
#endif
#if canImport(AppKit)
import AppKit
#endif

enum FocusTriageCardStyle {
    static let cornerRadius: CGFloat = 20
    static let margin: CGFloat = 16

    static var fill: Color {
        #if canImport(UIKit)
        Color(uiColor: .secondarySystemGroupedBackground)
        #else
        Color(nsColor: .controlBackgroundColor)
        #endif
    }
}

extension View {
    func focusTriageCardSurface() -> some View {
        let shape = RoundedRectangle(cornerRadius: FocusTriageCardStyle.cornerRadius, style: .continuous)

        return background(FocusTriageCardStyle.fill, in: shape)
            .clipShape(shape)
            .overlay { shape.strokeBorder(Color.primary.opacity(0.12), lineWidth: 1) }
            .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
    }

    func focusTriageCardMargins() -> some View {
        padding(.horizontal, FocusTriageCardStyle.margin)
            .padding(.top, 8)
            .padding(.bottom, FocusTriageCardStyle.margin)
    }
}

struct FocusTriageCardStackHint: View {
    var body: some View {
        Color.clear
            .focusTriageCardSurface()
            .focusTriageCardMargins()
            .scaleEffect(0.95)
            .offset(y: 10)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
