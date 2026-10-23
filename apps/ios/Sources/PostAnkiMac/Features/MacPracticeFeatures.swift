import SwiftUI

@MainActor
enum MacPracticeFeatures {
    static let features: [MacFeature] = [
        MacFeature(
            id: "quick-practice",
            section: .study,
            order: 30,
            title: "Quick practice",
            systemImage: "bolt",
            inSidebar: false,
            detail: { _ in AnyView(MacQuickPracticeView()) }
        )
    ]
}
