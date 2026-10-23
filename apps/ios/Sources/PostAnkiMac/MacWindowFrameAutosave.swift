import AppKit
import SwiftUI

struct MacWindowFrameAutosave: NSViewRepresentable {
    static let name = "PostAnkiMainWindow"

    func makeNSView(context: Context) -> NSView {
        FrameAutosaveView()
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

enum MacWindowPlacement {
    static func frame(moving frame: NSRect, toScreenUnder mouse: NSPoint, screens: [NSScreen]) -> NSRect {
        guard let target = screens.first(where: { $0.frame.contains(mouse) }) ?? screens.first else { return frame }

        let visible = target.visibleFrame

        if visible.contains(frame) { return frame }

        var moved = frame
        moved.size.width = min(frame.width, visible.width)
        moved.size.height = min(frame.height, visible.height)
        moved.origin.x = visible.midX - moved.width / 2
        moved.origin.y = visible.midY - moved.height / 2

        return moved
    }
}

private final class FrameAutosaveView: NSView {
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()

        guard let window, window.frameAutosaveName != MacWindowFrameAutosave.name else { return }

        window.setFrameAutosaveName(MacWindowFrameAutosave.name)
        window.setFrame(
            MacWindowPlacement.frame(moving: window.frame, toScreenUnder: NSEvent.mouseLocation, screens: NSScreen.screens),
            display: true
        )
    }
}
