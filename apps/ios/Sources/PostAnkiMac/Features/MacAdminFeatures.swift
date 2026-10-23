import SwiftUI

@MainActor
enum MacAdminFeatures {
    static let features: [MacFeature] = [
        MacFeature(
            id: "duplicates",
            section: .manage,
            order: 50,
            title: "Duplicates",
            systemImage: "square.on.square",
            inSidebar: false,
            detail: { _ in AnyView(MacDuplicatesView()) }
        ),
        MacFeature(
            id: "admin-scans",
            section: .admin,
            order: 10,
            title: "Admin scans",
            systemImage: "wrench.and.screwdriver",
            inSidebar: false,
            detail: { _ in AnyView(MacAdminView()) }
        )
    ]
}
