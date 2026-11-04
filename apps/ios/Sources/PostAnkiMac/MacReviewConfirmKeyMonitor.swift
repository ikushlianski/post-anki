import AppKit
import SwiftUI

private struct MacReviewConfirmKeyMonitor: ViewModifier {
    let isOverlayShown: () -> Bool
    let onConfirm: () -> Bool
    @State private var monitor: Any?

    func body(content: Content) -> some View {
        content
            .onAppear { install() }
            .onDisappear { remove() }
    }

    private func install() {
        guard monitor == nil else { return }

        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            guard let window = event.window, window.isKeyWindow else { return event }

            let blocking: NSEvent.ModifierFlags = [.command, .control, .option]
            let shouldConfirm = ReviewConfirmKey.shouldConfirm(
                keyCode: event.keyCode,
                hasCommandModifiers: !event.modifierFlags.intersection(blocking).isEmpty,
                isEditingText: window.firstResponder is NSText,
                isRepeat: event.isARepeat,
                isOverlayShown: window.attachedSheet != nil || isOverlayShown()
            )

            guard shouldConfirm else { return event }

            return onConfirm() ? nil : event
        }
    }

    private func remove() {
        guard let monitor else { return }

        NSEvent.removeMonitor(monitor)
        self.monitor = nil
    }
}

extension View {
    func onReviewConfirmKey(isOverlayShown: @escaping () -> Bool, perform: @escaping () -> Bool) -> some View {
        modifier(MacReviewConfirmKeyMonitor(isOverlayShown: isOverlayShown, onConfirm: perform))
    }
}
