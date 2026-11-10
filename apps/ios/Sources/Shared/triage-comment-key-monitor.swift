#if os(macOS)
import AppKit
import SwiftUI

final class TriageCommentKeyMonitor {
    var isActive = false
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
        guard isActive else { return event }

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
#endif
