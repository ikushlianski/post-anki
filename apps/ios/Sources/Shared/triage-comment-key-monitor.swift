#if os(macOS)
import AppKit
import SwiftUI

final class TriageCommentKeyMonitor {
    var isActive = false
    weak var window: NSWindow?
    var onDecision: ((PendingReviewTriageAction) -> Void)?
    var onEscape: (() -> Void)?
    private var token: Any?

    func start() {
        guard token == nil else { return }

        token = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            self?.consume(event) ?? event
        }
    }

    func stop() {
        if let token { NSEvent.removeMonitor(token) }

        token = nil
        isActive = false
    }

    private func consume(_ event: NSEvent) -> NSEvent? {
        guard Self.shouldHandle(
            isActive: isActive,
            eventWindow: event.window.map(ObjectIdentifier.init),
            triageWindow: window.map(ObjectIdentifier.init),
            triageWindowIsKey: window?.isKeyWindow ?? false
        ) else { return event }

        if event.keyCode == 53 {
            onEscape?()

            return nil
        }

        guard let input = Self.input(forKeyCode: event.keyCode),
              let action = PendingReviewTriageCommentKeys.fieldDecision(for: input, modifiers: Self.modifiers(of: event))
        else { return event }

        onDecision?(action)

        return nil
    }

    nonisolated static func shouldHandle(isActive: Bool, eventWindow: ObjectIdentifier?, triageWindow: ObjectIdentifier?, triageWindowIsKey: Bool) -> Bool {
        isActive && triageWindowIsKey && eventWindow != nil && eventWindow == triageWindow
    }

    static func modifiers(of event: NSEvent) -> EventModifiers {
        var result: EventModifiers = []
        let flags = event.modifierFlags

        if flags.contains(.command) { result.insert(.command) }

        if flags.contains(.shift) { result.insert(.shift) }

        if flags.contains(.option) { result.insert(.option) }

        if flags.contains(.control) { result.insert(.control) }

        return result
    }

    static func input(forKeyCode code: UInt16) -> PendingReviewTriageKeyInput? {
        switch code {
        case 123: return .left
        case 124: return .right
        case 126: return .up
        default: return nil
        }
    }
}

struct TriageWindowReader: NSViewRepresentable {
    let monitor: TriageCommentKeyMonitor

    func makeNSView(context: Context) -> NSView {
        let view = WindowTrackingView()

        view.onWindow = { [monitor] in monitor.window = $0 }

        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        monitor.window = nsView.window
    }

    private final class WindowTrackingView: NSView {
        var onWindow: ((NSWindow?) -> Void)?

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            onWindow?(window)
        }
    }
}
#endif
