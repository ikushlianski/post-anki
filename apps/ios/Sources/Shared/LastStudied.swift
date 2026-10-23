import Foundation

// No backend endpoint tracks "what was I last studying" — the post-anki API
// has no such field. Tracked client-side instead, updated whenever the
// learner opens a course from CoursesView.
enum LastStudied {
    private static let curriculumIdKey = "lastStudiedCurriculumId"
    private static let curriculumNameKey = "lastStudiedCurriculumName"
    private static let serverKey = "lastStudiedServerURL"

    static func record(
        curriculumId: String,
        curriculumName: String,
        defaults: UserDefaults = .standard
    ) {
        defaults.set(curriculumId, forKey: curriculumIdKey)
        defaults.set(curriculumName, forKey: curriculumNameKey)
        defaults.set(ServerScope.current, forKey: serverKey)
    }

    static func curriculumId(defaults: UserDefaults = .standard) -> String? {
        guard ServerScope.matches(defaults.string(forKey: serverKey)) else { return nil }

        return defaults.string(forKey: curriculumIdKey)
    }

    static func curriculumName(defaults: UserDefaults = .standard) -> String? {
        guard ServerScope.matches(defaults.string(forKey: serverKey)) else { return nil }

        return defaults.string(forKey: curriculumNameKey)
    }

    static var curriculumId: String? { curriculumId() }

    static var curriculumName: String? { curriculumName() }
}
