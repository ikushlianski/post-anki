import SwiftUI

@MainActor
enum MacCoreFeatures {
    static let features: [MacFeature] = [
        MacFeature(
            id: "home",
            section: .study,
            order: 10,
            title: "Home",
            systemImage: "house",
            shortcut: MacFeatureShortcut(key: "1"),
            inSidebar: false,
            detail: { navigator in
                AnyView(MacHomeView(
                    onStudyNow: { navigator.select("review") },
                    onOpenCourses: { navigator.select("courses") }
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
            detail: { _ in AnyView(MacReviewView()) }
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
            systemImage: "square.and.pencil",
            shortcut: MacFeatureShortcut(key: "6"),
            inSidebar: false,
            detail: { _ in AnyView(IngestionDictationScreen()) }
        )
    ]
}
