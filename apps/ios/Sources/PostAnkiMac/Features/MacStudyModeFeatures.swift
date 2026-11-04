import SwiftUI

@MainActor
enum MacStudyModeFeatures {
    static let features: [MacFeature] = [
        MacFeature(
            id: "study-plan",
            section: .study,
            order: 30,
            title: "Study plan",
            systemImage: "calendar",
            detail: { _ in AnyView(StudyPlanSubjectPicker()) }
        ),
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
            id: "triage-history",
            section: .study,
            order: 45,
            title: "Triage history",
            systemImage: "clock.arrow.circlepath",
            inSidebar: false,
            detail: { _ in AnyView(TriageHistoryScreen()) }
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
