import SwiftUI
import AppKit

final class MacZoomContainer: NSView {
    let hosting: NSHostingView<AnyView>
    var scale = 1.0 { didSet { needsLayout = true } }

    init(root: AnyView) {
        hosting = NSHostingView(rootView: root)
        super.init(frame: .zero)
        addSubview(hosting)
    }

    required init?(coder: NSCoder) { nil }

    override func layout() {
        super.layout()
        let size = frame.size
        let inner = NSSize(width: size.width / scale, height: size.height / scale)
        setBoundsSize(inner)
        hosting.frame = NSRect(origin: .zero, size: inner)
    }
}

struct MacZoomHost<Content: View>: NSViewRepresentable {
    let scale: Double
    let content: Content

    func makeNSView(context: Context) -> MacZoomContainer {
        let view = MacZoomContainer(root: AnyView(content))
        view.scale = scale
        return view
    }

    func updateNSView(_ view: MacZoomContainer, context: Context) {
        view.hosting.rootView = AnyView(content)
        view.scale = scale
    }
}
