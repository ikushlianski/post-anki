import SwiftUI

@MainActor
enum MacAuthoringFeatures {
    static let features: [MacFeature] = [
        MacFeature(
            id: "course-builds",
            section: .manage,
            order: 30,
            title: "Course builds",
            systemImage: "hammer",
            ownsStack: true,
            detail: { _ in AnyView(MacCourseBuildsEntryView()) }
        ),
        MacFeature(
            id: "course-refocus",
            section: .manage,
            order: 40,
            title: "Refocus suggestions",
            systemImage: "scope",
            ownsStack: true,
            detail: { _ in AnyView(MacRefocusView()) }
        )
    ]
}
