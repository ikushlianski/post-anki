import SwiftUI

@MainActor
enum MacCoreFeatures {
    static let features: [MacFeature] = [
        MacFeature(
            id: "home",
            section: .study,
            order: 10,
            title: "Today",
            systemImage: "sun.max",
            shortcut: MacFeatureShortcut(key: "1"),
            detail: { navigator in
                AnyView(MacHomeView(
                    onStudyNow: { navigator.select("review") },
                    onOpenCourses: { navigator.select("courses") },
                    onAddKnowledge: { navigator.select("ingest") }
                ))
            }
        ),
        MacFeature(
            id: "review",
            section: .library,
            order: 35,
            title: "Review",
            systemImage: "checkmark.seal",
            shortcut: MacFeatureShortcut(key: "3"),
            ownsStack: true,
            detail: { _ in AnyView(MacReviewView()) }
        ),
        MacFeature(
            id: "chat",
            section: .library,
            order: 36,
            title: "Chat",
            systemImage: "bubble.left.and.bubble.right",
            ownsStack: true,
            detail: { _ in AnyView(MacChatQueueView()) }
        ),
        MacFeature(
            id: "progress",
            section: .study,
            order: 80,
            title: "Progress",
            systemImage: "chart.line.uptrend.xyaxis",
            shortcut: MacFeatureShortcut(key: "5"),
            inSidebar: false,
            detail: { _ in AnyView(MacProgressView()) }
        ),
        MacFeature(
            id: "statistics",
            section: .study,
            order: 85,
            title: "Statistics",
            systemImage: "chart.xyaxis.line",
            inSidebar: false,
            detail: { _ in AnyView(OwnerStatsScreen()) }
        ),
        MacFeature(
            id: "courses",
            section: .library,
            order: 10,
            title: "Courses",
            systemImage: "book",
            shortcut: MacFeatureShortcut(key: "2"),
            ownsStack: true,
            inSidebar: false,
            detail: { _ in AnyView(MacCoursesView()) }
        ),
        MacFeature(
            id: "knowledge",
            section: .library,
            order: 20,
            title: "Knowledge",
            systemImage: "brain",
            shortcut: MacFeatureShortcut(key: "4"),
            ownsStack: true,
            detail: { _ in AnyView(MacKnowledgeView()) }
        ),
        MacFeature(
            id: "ingest",
            section: .library,
            order: 90,
            title: "Add knowledge",
            systemImage: "plus.circle",
            shortcut: MacFeatureShortcut(key: "6"),
            detail: { _ in AnyView(IngestionDictationScreen()) }
        )
    ]
}
