import SwiftUI

@MainActor
enum MacStructureFeatures {
    static let features: [MacFeature] = [
        MacFeature(
            id: "subjects",
            section: .manage,
            order: 10,
            title: "Subjects",
            systemImage: "folder.badge.gearshape",
            ownsStack: true,
            detail: { _ in AnyView(MacSubjectsView()) }
        ),
        MacFeature(
            id: "knowledge-maps",
            section: .manage,
            order: 20,
            title: "Knowledge maps",
            systemImage: "map",
            ownsStack: true,
            detail: { _ in AnyView(MacKnowledgeMapsView()) }
        )
    ]
}
