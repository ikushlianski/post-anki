import PostAnkiAPI
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

enum FocusTriageSwipe {
    static let threshold: CGFloat = 40
    static let flingThreshold: CGFloat = 300
    static let minimumDrag: CGFloat = 12

    static let holdDuration: TimeInterval = 0.35

    static func startsAsHold(heldFor: TimeInterval) -> Bool {
        heldFor >= holdDuration
    }

    static func decision(width: CGFloat, predictedWidth: CGFloat) -> PendingReviewDecision? {
        if abs(width) >= threshold { return width > 0 ? .approve : .reject }

        let sameDirection = width != 0 && (width > 0) == (predictedWidth > 0)

        if sameDirection, abs(predictedWidth) >= flingThreshold, abs(width) >= minimumDrag {
            return width > 0 ? .approve : .reject
        }

        return nil
    }
}

final class FocusTriageTouchClock {
    var start: Date?
}

struct FocusTriageSwipeCard<Content: View>: View {
    let isBusy: Bool
    var scrollEdge = FocusTriageScrollEdge()
    var exampleLabel = TriageActionName.example
    var onExample: () async -> Void = {}
    let onDecide: (PendingReviewDecision) async -> Bool
    var onVertical: (FocusTriageVerticalAction) async -> Bool = { _ in false }
    let onFlownOff: () -> Void
    @ViewBuilder let content: () -> Content

    @State private var offset: CGFloat = 0
    @State private var offsetY: CGFloat = 0
    @State private var startEdge = FocusTriageScrollEdge()
    @State private var verticalHint: FocusTriageVerticalAction?
    @State private var axis: Axis?
    @State private var isDeciding = false
    @State private var opacity: Double = 1
    @State private var touchClock = FocusTriageTouchClock()
    @State private var ignoresDrag = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let flyDistance: CGFloat = 700

    var body: some View {
        content()
            .focusTriageCardSurface()
            .overlay { tint.clipShape(RoundedRectangle(cornerRadius: FocusTriageCardStyle.cornerRadius, style: .continuous)) }
            .focusTriageCardMargins()
            .offset(x: offset, y: offsetY)
            .rotationEffect(.degrees(Double(offset) / 40))
            .opacity(opacity)
            .simultaneousGesture(touchDown)
            .simultaneousGesture(drag)
            .accessibilityAction(named: FocusTriageActionLabel.approve) { perform(.approve) }
            .accessibilityAction(named: FocusTriageActionLabel.reject) { perform(.reject) }
            .accessibilityAction(named: FocusTriageActionLabel.inbox) { performVertical(.inbox) }
            .accessibilityAction(named: FocusTriageActionLabel.chat) { performVertical(.chat) }
            .accessibilityAction(named: exampleLabel) { Task { await onExample() } }
    }

    private var pending: PendingReviewDecision? {
        if offset > 0 { return .approve }

        return offset < 0 ? .reject : nil
    }

    @ViewBuilder
    private var tint: some View {
        if let verticalHint {
            overlay(
                symbol: FocusTriageActionLabel.symbol(for: verticalHint),
                title: FocusTriageActionLabel.name(for: verticalHint),
                color: verticalHint == .inbox ? Color.indigo : Color.teal,
                strength: 0.6
            )
        } else if let pending {
            overlay(
                symbol: FocusTriageActionLabel.symbol(for: pending),
                title: pending == .approve ? FocusTriageActionLabel.approve : FocusTriageActionLabel.reject,
                color: pending == .approve ? Color.green : Color.red,
                strength: min(abs(offset) / FocusTriageSwipe.threshold, 1)
            )
        }
    }

    private func overlay(symbol: String, title: String, color: Color, strength: Double) -> some View {
        ZStack {
            color.opacity(0.3 * strength)

            ZoomHStack(spacing: 10) {
                Image(systemName: symbol)
                    .accessibilityHidden(true)

                Text(title)
            }
            .zoomFont(.largeTitle.weight(.bold))
            .foregroundStyle(color)
            .opacity(strength)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private var touchDown: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                if touchClock.start == nil { touchClock.start = value.time }
            }
            .onEnded { _ in
                touchClock.start = nil
                ignoresDrag = false
            }
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: FocusTriageSwipe.minimumDrag)
            .onChanged { value in
                guard !isDeciding, !isBusy, !ignoresDrag else { return }

                if axis == nil, let start = touchClock.start,
                   FocusTriageSwipe.startsAsHold(heldFor: value.time.timeIntervalSince(start)) {
                    ignoresDrag = true

                    return
                }

                if axis == nil {
                    axis = abs(value.translation.width) > abs(value.translation.height) ? .horizontal : .vertical

                    if axis == .horizontal { dismissKeyboard() }

                    if axis == .vertical { startEdge = scrollEdge }
                }

                if axis == .horizontal { offset = value.translation.width }

                if axis == .vertical { verticalHint = hint(for: value.translation) }
            }
            .onEnded { value in
                defer {
                    axis = nil
                    verticalHint = nil
                }

                guard !isDeciding, !ignoresDrag else { return }

                if axis == .vertical, !isBusy {
                    let action = FocusTriageVertical.action(
                        translation: value.translation,
                        predictedHeight: value.predictedEndTranslation.height,
                        start: startEdge,
                        end: scrollEdge
                    )

                    if let action { performVertical(action) }

                    return
                }

                guard axis == .horizontal, !isBusy else { return snapBack() }

                let decision = FocusTriageSwipe.decision(
                    width: value.translation.width,
                    predictedWidth: value.predictedEndTranslation.width
                )

                if let decision { perform(decision) } else { snapBack() }
            }
    }

    private func hint(for translation: CGSize) -> FocusTriageVerticalAction? {
        guard let action = FocusTriageVertical.direction(height: translation.height) else { return nil }
        guard abs(translation.height) >= FocusTriageVertical.threshold / 2 else { return nil }
        guard abs(translation.height) >= FocusTriageVertical.dominance * abs(translation.width) else { return nil }
        guard FocusTriageVertical.isEdgeClear(for: action, edge: startEdge) else { return nil }

        return FocusTriageVertical.isEdgeClear(for: action, edge: scrollEdge) ? action : nil
    }

    private func performVertical(_ action: FocusTriageVerticalAction) {
        guard !isDeciding, !isBusy else { return }

        isDeciding = true

        Task {
            let succeeded = await onVertical(action)

            if succeeded {
                flyOffVertically(action)
            } else {
                isDeciding = false
            }
        }
    }

    private func flyOffVertically(_ action: FocusTriageVerticalAction) {
        if reduceMotion {
            withAnimation(.easeOut(duration: 0.15), completionCriteria: .logicallyComplete) {
                opacity = 0
            } completion: {
                onFlownOff()
            }
        } else {
            withAnimation(.easeIn(duration: 0.22), completionCriteria: .logicallyComplete) {
                offsetY = action == .inbox ? flyDistance : -flyDistance
            } completion: {
                onFlownOff()
            }
        }
    }

    private func perform(_ decision: PendingReviewDecision) {
        guard !isDeciding, !isBusy else { return }

        isDeciding = true

        Task {
            guard await onDecide(decision) else {
                isDeciding = false
                return snapBack()
            }

            flyOff(decision)
        }
    }

    private func flyOff(_ decision: PendingReviewDecision) {
        if reduceMotion {
            withAnimation(.easeOut(duration: 0.15), completionCriteria: .logicallyComplete) {
                opacity = 0
            } completion: {
                onFlownOff()
            }
        } else {
            withAnimation(.easeIn(duration: 0.22), completionCriteria: .logicallyComplete) {
                offset = decision == .approve ? flyDistance : -flyDistance
            } completion: {
                onFlownOff()
            }
        }
    }

    private func snapBack() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) { offset = 0 }
    }

    private func dismissKeyboard() {
        #if canImport(UIKit)
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        #endif
    }
}
