import SwiftUI

@MainActor
enum MacLanguageFeatures {
    static let features: [MacFeature] = [
        MacFeature(
            id: "language-practice",
            section: .study,
            order: 70,
            title: "Language practice",
            systemImage: "character.bubble",
            ownsStack: true,
            detail: { _ in AnyView(MacLanguagePracticeView()) }
        )
    ]
}
