import PostAnkiAPI

struct FocusTriageDecisionEntry {
    let bitId: String
    let verdict: TriageVerdict
    let removed: PendingReviewRemovedBit?
}

struct FocusTriageDecisionLog {
    static let maxDecisions = 500

    private(set) var entries: [FocusTriageDecisionEntry] = []
    private var baseline: Set<String> = []

    var lastDecided: FocusTriageDecisionEntry? { entries.last }

    mutating func record(_ entry: FocusTriageDecisionEntry) {
        entries.removeAll { $0.bitId == entry.bitId }
        entries.append(entry)
    }

    mutating func remove(bitId: String) {
        entries.removeAll { $0.bitId == bitId }
    }

    mutating func markBaseline() {
        baseline = Set(entries.map(\.bitId))
    }

    func sessionDecisions(earlier: [TriageDecision] = []) -> [TriageDecision] {
        let current = entries
            .filter { !baseline.contains($0.bitId) }
            .map { TriageDecision(bitId: $0.bitId, verdict: $0.verdict) }
        let currentIds = Set(current.map(\.bitId))
        let kept = earlier.filter { !currentIds.contains($0.bitId) }

        return kept + current
    }

    func cappedDecisions(earlier: [TriageDecision] = []) -> [TriageDecision] {
        Array(sessionDecisions(earlier: earlier).suffix(Self.maxDecisions))
    }

    func acceptedCount(earlier: [TriageDecision] = []) -> Int {
        sessionDecisions(earlier: earlier).filter { $0.verdict == .approved }.count
    }

    func rejectedCount(earlier: [TriageDecision] = []) -> Int {
        sessionDecisions(earlier: earlier).filter { $0.verdict == .rejected }.count
    }
}
