import PostAnkiAPI
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

enum FocusTriageSwipe {
    static let threshold: CGFloat = 110
    static let flingThreshold: CGFloat = 300
    static let minimumDrag: CGFloat = 20

    static func decision(width: CGFloat, predictedWidth: CGFloat) -> PendingReviewDecision? {
        if abs(width) >= threshold { return width > 0 ? .approve : .reject }

        let sameDirection = width != 0 && (width > 0) == (predictedWidth > 0)

        if sameDirection, abs(predictedWidth) >= flingThreshold, abs(width) >= minimumDrag {
            return width > 0 ? .approve : .reject
        }

        return nil
    }
}

struct FocusTriageSwipeCard<Content: View>: View {
    let isBusy: Bool
    let onDecide: (PendingReviewDecision) async -> Void
    @ViewBuilder let content: () -> Content

    @State private var offset: CGFloat = 0
    @State private var axis: Axis?
    @State private var isDeciding = false

    private let flyDistance: CGFloat = 700

    var body: some View {
        content()
            .offset(x: offset)
            .rotationEffect(.degrees(Double(offset) / 40))
            .overlay { tint }
            .simultaneousGesture(drag)
            .accessibilityAction(named: "Approve") { perform(.approve) }
            .accessibilityAction(named: "Reject") { perform(.reject) }
    }

    private var pending: PendingReviewDecision? {
        if offset > 0 { return .approve }

        return offset < 0 ? .reject : nil
    }

    @ViewBuilder
    private var tint: some View {
        if let pending {
            let isApprove = pending == .approve

            ZStack {
                (isApprove ? Color.green : Color.red)
                    .opacity(min(abs(offset) / FocusTriageSwipe.threshold, 1) * 0.3)

                Text(isApprove ? "Approve" : "Reject")
                    .zoomFont(.largeTitle.weight(.bold))
                    .foregroundStyle(isApprove ? Color.green : Color.red)
                    .opacity(min(abs(offset) / FocusTriageSwipe.threshold, 1))
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: FocusTriageSwipe.minimumDrag)
            .onChanged { value in
                guard !isDeciding, !isBusy else { return }

                if axis == nil {
                    axis = abs(value.translation.width) > abs(value.translation.height) ? .horizontal : .vertical

                    if axis == .horizontal { dismissKeyboard() }
                }

                if axis == .horizontal { offset = value.translation.width }
            }
            .onEnded { value in
                defer { axis = nil }

                guard !isDeciding else { return }
                guard axis == .horizontal, !isBusy else { return snapBack() }

                let decision = FocusTriageSwipe.decision(
                    width: value.translation.width,
                    predictedWidth: value.predictedEndTranslation.width
                )

                if let decision { perform(decision) } else { snapBack() }
            }
    }

    private func perform(_ decision: PendingReviewDecision) {
        guard !isDeciding, !isBusy else { return }

        isDeciding = true

        withAnimation(.easeIn(duration: 0.2)) {
            offset = decision == .approve ? flyDistance : -flyDistance
        }

        Task {
            await onDecide(decision)
            isDeciding = false
            snapBack()
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
