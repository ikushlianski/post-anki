import SwiftUI

@MainActor
enum MacStudyModeFeatures {
    static let features: [MacFeature] = [
        MacFeature(
            id: "study-sessions",
            section: .study,
            order: 40,
            title: "Study sessions",
            systemImage: "calendar.badge.clock",
            ownsStack: true,
            inSidebar: false,
            detail: { _ in AnyView(MacStudySessionsView()) }
        ),
        MacFeature(
            id: "resurfacing-gaps",
            section: .study,
            order: 50,
            title: "Gaps coming back",
            systemImage: "arrow.uturn.backward.circle",
            inSidebar: false,
            detail: { _ in AnyView(MacResurfacingGapsView()) }
        )
    ]
}
