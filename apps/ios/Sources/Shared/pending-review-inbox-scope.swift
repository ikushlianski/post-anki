import PostAnkiAPI

enum PendingReviewInboxScope {
    static func visibleSources(
        _ sources: [PendingReviewSource],
        subjectId: String?,
        resumed: FocusTriageStoredSession?
    ) -> [PendingReviewSource] {
        let subject = resumed?.subjectId ?? PendingReviewInboxSummary.validSubject(subjectId, in: sources)

        return FocusTriageSubject.filter(sources, subjectId: subject).filter { !$0.bits.isEmpty }
    }
}
