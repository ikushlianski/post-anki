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
            id: MacSettingsRoute.featureID,
            section: .manage,
            order: 90,
            title: "Settings",
            systemImage: "gearshape",
            detail: { _ in AnyView(MacSettingsView()) }
        ),
        MacFeature(
            id: "account",
            section: .manage,
            order: 92,
            title: "Account",
            systemImage: "person.crop.circle",
            detail: { _ in AnyView(AccountScreen()) }
        ),
        MacFeature(
            id: "about",
            section: .manage,
            order: 95,
            title: "About",
            systemImage: "info.circle",
            detail: { _ in AnyView(AboutScreen()) }
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
