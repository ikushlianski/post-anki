import AppKit
import SwiftUI

struct MacWindowFrameAutosave: NSViewRepresentable {
    static let name = "PostAnkiMainWindow"

    func makeNSView(context: Context) -> NSView {
        FrameAutosaveView()
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

private final class FrameAutosaveView: NSView {
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()

        guard let window, window.frameAutosaveName != MacWindowFrameAutosave.name else { return }

        window.setFrameAutosaveName(MacWindowFrameAutosave.name)
    }
}
