import SwiftUI

enum MacZoom {
    static let storageKey = "mac.zoomScale"
    static let steps: [Double] = [0.5, 0.67, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0]
    static let actualSize = 1.0

    static func zoomedIn(from scale: Double) -> Double {
        steps.first { $0 > scale + 0.001 } ?? steps[steps.count - 1]
    }

    static func zoomedOut(from scale: Double) -> Double {
        steps.last { $0 < scale - 0.001 } ?? steps[0]
    }

    static func clamped(_ scale: Double) -> Double {
        min(max(scale, steps[0]), steps[steps.count - 1])
    }

    static func percent(_ scale: Double) -> Int {
        Int((scale * 100).rounded())
    }
}

struct MacZoomModifier: ViewModifier {
    @AppStorage(MacZoom.storageKey) private var stored = MacZoom.actualSize

    func body(content: Content) -> some View {
        content
            .zoomFont(.body)
            .environment(\.zoomScale, MacZoom.clamped(stored))
    }
}

extension View {
    func macZoomed() -> some View {
        modifier(MacZoomModifier())
    }
}
