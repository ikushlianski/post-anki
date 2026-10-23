import SwiftUI

private struct ZoomScaleKey: EnvironmentKey {
    static let defaultValue = 1.0
}

extension EnvironmentValues {
    var zoomScale: Double {
        get { self[ZoomScaleKey.self] }
        set { self[ZoomScaleKey.self] = newValue }
    }
}

@propertyWrapper
struct ZoomMetric: DynamicProperty {
    @Environment(\.zoomScale) private var scale
    private let base: CGFloat

    init(wrappedValue: CGFloat) {
        base = wrappedValue
    }

    var wrappedValue: CGFloat { base * CGFloat(scale) }
}

struct ZoomPaddingModifier: ViewModifier {
    @Environment(\.zoomScale) private var scale
    let edges: Edge.Set
    let length: CGFloat?

    func body(content: Content) -> some View {
        if scale == 1 {
            content.padding(edges, length)
        } else {
            content.padding(edges, (length ?? ZoomFont.defaultPadding) * CGFloat(scale))
        }
    }
}

struct ZoomStack<Content: View>: View {
    enum Axis { case vertical, horizontal }

    @Environment(\.zoomScale) private var scale
    let axis: Axis
    let alignmentH: HorizontalAlignment
    let alignmentV: VerticalAlignment
    let spacing: CGFloat
    let content: Content

    var body: some View {
        switch axis {
        case .vertical:
            VStack(alignment: alignmentH, spacing: spacing * CGFloat(scale)) { content }
        case .horizontal:
            HStack(alignment: alignmentV, spacing: spacing * CGFloat(scale)) { content }
        }
    }
}

func ZoomVStack<Content: View>(
    alignment: HorizontalAlignment = .center,
    spacing: CGFloat,
    @ViewBuilder content: () -> Content
) -> ZoomStack<Content> {
    ZoomStack(axis: .vertical, alignmentH: alignment, alignmentV: .center, spacing: spacing, content: content())
}

func ZoomHStack<Content: View>(
    alignment: VerticalAlignment = .center,
    spacing: CGFloat,
    @ViewBuilder content: () -> Content
) -> ZoomStack<Content> {
    ZoomStack(axis: .horizontal, alignmentH: .center, alignmentV: alignment, spacing: spacing, content: content())
}

extension View {
    func zoomPadding(_ edges: Edge.Set = .all, _ length: CGFloat? = nil) -> some View {
        modifier(ZoomPaddingModifier(edges: edges, length: length))
    }

    func zoomPadding(_ length: CGFloat) -> some View {
        modifier(ZoomPaddingModifier(edges: .all, length: length))
    }
}
