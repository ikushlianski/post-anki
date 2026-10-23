import SwiftUI

struct ZoomFont {
    enum Base {
        case style(Font.TextStyle)
        case size(CGFloat)
    }

    var base: Base
    var weight: Font.Weight?
    var design: Font.Design?
    var isMonospaced = false
    var isItalic = false
    var isMonoDigit = false

    static let largeTitle = ZoomFont(base: .style(.largeTitle))
    static let title = ZoomFont(base: .style(.title))
    static let title2 = ZoomFont(base: .style(.title2))
    static let title3 = ZoomFont(base: .style(.title3))
    static let headline = ZoomFont(base: .style(.headline))
    static let subheadline = ZoomFont(base: .style(.subheadline))
    static let body = ZoomFont(base: .style(.body))
    static let callout = ZoomFont(base: .style(.callout))
    static let footnote = ZoomFont(base: .style(.footnote))
    static let caption = ZoomFont(base: .style(.caption))
    static let caption2 = ZoomFont(base: .style(.caption2))

    static func system(size: CGFloat, weight: Font.Weight? = nil, design: Font.Design? = nil) -> ZoomFont {
        ZoomFont(base: .size(size), weight: weight, design: design)
    }

    func weight(_ value: Font.Weight) -> ZoomFont {
        var copy = self
        copy.weight = value
        return copy
    }

    func bold() -> ZoomFont { weight(.bold) }

    func italic() -> ZoomFont {
        var copy = self
        copy.isItalic = true
        return copy
    }

    func monospacedDigit() -> ZoomFont {
        var copy = self
        copy.isMonoDigit = true
        return copy
    }

    func monospaced() -> ZoomFont {
        var copy = self
        copy.isMonospaced = true
        return copy
    }

    #if os(macOS)
    static let defaultPadding: CGFloat = 10
    #else
    static let defaultPadding: CGFloat = 16
    #endif

    static func pointSize(of style: Font.TextStyle) -> CGFloat {
        #if os(macOS)
        switch style {
        case .largeTitle: 26
        case .title: 22
        case .title2: 17
        case .title3: 15
        case .headline, .body: 13
        case .callout: 12
        case .subheadline: 11
        default: 10
        }
        #else
        switch style {
        case .largeTitle: 34
        case .title: 28
        case .title2: 22
        case .title3: 20
        case .headline, .body: 17
        case .callout: 16
        case .subheadline: 15
        case .footnote: 13
        case .caption: 12
        default: 11
        }
        #endif
    }

    func pointSize(scale: Double) -> CGFloat {
        switch base {
        case .style(let style): Self.pointSize(of: style) * CGFloat(scale)
        case .size(let value): value * CGFloat(scale)
        }
    }

    func resolved(scale: Double) -> Font {
        var font: Font

        switch base {
        case .style(let style) where scale == 1:
            font = .system(style, design: design)
        case .style(let style):
            let isHeadline = style == .headline
            font = .system(size: pointSize(scale: scale), weight: weight ?? (isHeadline ? .semibold : nil), design: design)
        case .size:
            font = .system(size: pointSize(scale: scale), weight: weight, design: design)
        }

        if case .style = base, scale == 1, let weight {
            font = font.weight(weight)
        }

        if isMonospaced { font = font.monospaced() }

        if isMonoDigit { font = font.monospacedDigit() }

        if isItalic { font = font.italic() }

        return font
    }
}

struct ZoomFontModifier: ViewModifier {
    @Environment(\.zoomScale) private var scale
    let font: ZoomFont

    func body(content: Content) -> some View {
        content.font(font.resolved(scale: scale))
    }
}

extension View {
    func zoomFont(_ font: ZoomFont) -> some View {
        modifier(ZoomFontModifier(font: font))
    }
}
