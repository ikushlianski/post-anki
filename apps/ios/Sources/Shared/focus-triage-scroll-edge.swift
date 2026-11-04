import SwiftUI

private struct FocusTriageContentFrame: Equatable {
    var minY: CGFloat = 0
    var height: CGFloat = 0
}

private struct FocusTriageContentFrameKey: PreferenceKey {
    static var defaultValue: FocusTriageContentFrame { FocusTriageContentFrame() }

    static func reduce(value: inout FocusTriageContentFrame, nextValue: () -> FocusTriageContentFrame) {
        value = nextValue()
    }
}

private struct FocusTriageScrollEdgeTracker: ViewModifier {
    static let space = "focusTriageScroll"

    let onChange: (FocusTriageScrollEdge) -> Void

    @State private var frame = FocusTriageContentFrame()
    @State private var viewport: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .coordinateSpace(name: Self.space)
            .background {
                GeometryReader { proxy in
                    Color.clear
                        .onAppear { viewport = proxy.size.height }
                        .onChange(of: proxy.size.height) { _, height in viewport = height }
                }
            }
            .onPreferenceChange(FocusTriageContentFrameKey.self) { frame = $0 }
            .onChange(of: frame) { publish() }
            .onChange(of: viewport) { publish() }
    }

    private func publish() {
        onChange(FocusTriageScrollEdge.measure(contentMinY: frame.minY, contentHeight: frame.height, viewportHeight: viewport))
    }
}

private struct FocusTriageContentFrameReader: ViewModifier {
    func body(content: Content) -> some View {
        content.background {
            GeometryReader { proxy in
                let frame = proxy.frame(in: .named(FocusTriageScrollEdgeTracker.space))

                Color.clear.preference(
                    key: FocusTriageContentFrameKey.self,
                    value: FocusTriageContentFrame(minY: frame.minY, height: frame.height)
                )
            }
        }
    }
}

extension View {
    func trackingScrollEdge(_ onChange: @escaping (FocusTriageScrollEdge) -> Void) -> some View {
        modifier(FocusTriageScrollEdgeTracker(onChange: onChange))
    }

    func readingScrollContentFrame() -> some View {
        modifier(FocusTriageContentFrameReader())
    }
}
