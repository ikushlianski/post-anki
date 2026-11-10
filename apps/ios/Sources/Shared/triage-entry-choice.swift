import PostAnkiAPI

enum TriageEntryChoice {
    enum Primary: Equatable {
        case resume
        case triageAll
    }

    static func primary(stored: FocusTriageStoredSession?) -> Primary {
        stored == nil ? .triageAll : .resume
    }

    static func resumeTitle(stored: FocusTriageStoredSession?, subjectName: String?) -> String {
        guard stored?.subjectId != nil, let subjectName, !subjectName.isEmpty else { return "Resume triage" }

        return "Resume triage · \(subjectName)"
    }

    static func subjectName(
        stored: FocusTriageStoredSession?,
        rows: [PendingReviewSubjectCount],
        sources: [PendingReviewSource]
    ) -> String? {
        guard let id = stored?.subjectId else { return nil }

        return rows.first { $0.subjectId == id }?.name ?? sources.first { $0.subjectId == id }?.subjectName
    }

    static func needsFreshStart(stored: FocusTriageStoredSession?, subjectId: String?) -> Bool {
        guard let stored else { return false }

        return stored.subjectId != subjectId
    }

    static func totalItems(_ sources: [PendingReviewSource]) -> Int {
        sources.reduce(0) { $0 + $1.bits.count }
    }

    static func showAllTitle(_ count: Int) -> String { "Show all items (\(count))" }
}
