import SwiftUI

@MainActor
enum MacLearnFeatures {
    static let features: [MacFeature] = [
        MacFeature(
            id: "learning-list",
            section: .learn,
            order: 10,
            title: "Learning list",
            systemImage: "list.bullet.clipboard",
            shortcut: MacFeatureShortcut(key: "l", modifiers: [.command, .shift]),
            ownsStack: true,
            inSidebar: false,
            detail: { _ in AnyView(MacLearningListView()) }
        ),
        MacFeature(
            id: "learning-paths",
            section: .learn,
            order: 20,
            title: "Learning paths",
            systemImage: "point.topleft.down.curvedto.point.bottomright.up",
            ownsStack: true,
            inSidebar: false,
            detail: { _ in AnyView(MacLearningPathsView()) }
        ),
        MacFeature(
            id: "decide",
            section: .learn,
            order: 30,
            title: "Challenge my thinking",
            systemImage: "scale.3d",
            ownsStack: true,
            inSidebar: false,
            detail: { _ in AnyView(MacDecideView()) }
        ),
        MacFeature(
            id: "ask",
            section: .learn,
            order: 40,
            title: "Ask your cards",
            systemImage: "text.bubble",
            inSidebar: false,
            detail: { _ in AnyView(MacAskView()) }
        ),
        MacFeature(
            id: "open-questions",
            section: .learn,
            order: 50,
            title: "Open questions",
            systemImage: "questionmark.bubble",
            inSidebar: false,
            detail: { _ in AnyView(MacOpenQuestionsView()) }
        ),
        MacFeature(
            id: "daily-push",
            section: .study,
            order: 60,
            title: "Daily push",
            systemImage: "sunrise",
            inSidebar: false,
            detail: { _ in AnyView(MacDailyPushView()) }
        )
    ]
}
