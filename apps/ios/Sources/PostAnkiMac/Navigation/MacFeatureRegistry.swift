import SwiftUI

@MainActor
enum MacFeatureRegistry {
    static let fallbackID = "knowledge"

    static let features: [MacFeature] = (
        MacCoreFeatures.features
            + MacPracticeFeatures.features
            + MacStudyModeFeatures.features
            + MacLibraryFeatures.features
            + MacLearnFeatures.features
            + MacAuthoringFeatures.features
            + MacStructureFeatures.features
            + MacLanguageFeatures.features
            + MacAdminFeatures.features
    )
    .sorted { ($0.section.sortIndex, $0.order) < ($1.section.sortIndex, $1.order) }

    static func features(in section: MacFeatureSection) -> [MacFeature] {
        features.filter { $0.section == section }
    }

    static func sidebarFeatures(in section: MacFeatureSection) -> [MacFeature] {
        features(in: section).filter(\.inSidebar)
    }

    static var sidebarSections: [MacFeatureSection] {
        MacFeatureSection.allCases.filter { !sidebarFeatures(in: $0).isEmpty }
    }

    static var visibleSections: [MacFeatureSection] {
        MacFeatureSection.allCases.filter { !features(in: $0).isEmpty }
    }

    static func feature(id: String) -> MacFeature {
        features.first { $0.id == id }
            ?? features.first { $0.id == fallbackID }
            ?? features[0]
    }

    static let reservedShortcuts: Set<MacFeatureShortcut> = [
        MacFeatureShortcut(key: "n"),
        MacFeatureShortcut(key: "r"),
        MacFeatureShortcut(key: "f"),
        MacFeatureShortcut(key: ","),
        MacFeatureShortcut(key: "k"),
        MacFeatureShortcut(key: "["),
        MacFeatureShortcut(key: "]"),
        MacFeatureShortcut(key: "m", modifiers: [.command, .shift]),
        MacFeatureShortcut(key: "s", modifiers: [.command, .option])
    ]

    static func validationProblems() -> [String] {
        var problems: [String] = []
        var seenIDs = Set<String>()
        var seenShortcuts = Set<MacFeatureShortcut>()

        for feature in features {
            if !seenIDs.insert(feature.id).inserted {
                problems.append("duplicate feature id \(feature.id)")
            }

            guard let shortcut = feature.shortcut else { continue }

            if reservedShortcuts.contains(shortcut) {
                problems.append("reserved shortcut on \(feature.id)")
            }

            if !seenShortcuts.insert(shortcut).inserted {
                problems.append("duplicate shortcut on \(feature.id)")
            }
        }

        if feature(id: fallbackID).inSidebar == false {
            problems.append("fallback feature \(fallbackID) is hidden from the sidebar")
        }

        if !seenIDs.contains(fallbackID) {
            problems.append("missing fallback feature \(fallbackID)")
        }

        if feature(id: "no-such-stored-id").id != fallbackID {
            problems.append("unknown stored id does not fall back to \(fallbackID)")
        }

        return problems
    }

    static func assertValid() {
        #if DEBUG
        let problems = validationProblems()
        assert(problems.isEmpty, "Mac feature registry invalid: \(problems.joined(separator: "; "))")
        #endif
    }
}

private extension MacFeatureSection {
    var sortIndex: Int { Self.allCases.firstIndex(of: self) ?? 0 }
}
