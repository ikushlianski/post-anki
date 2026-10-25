import PostAnkiAPI

struct FocusTriageDecisionEntry {
    let bitId: String
    let verdict: TriageVerdict
    let removed: PendingReviewRemovedBit?
    var note: String?
    var reasonCode: String?
    var dwellMs: Int?

    init(
        bitId: String,
        verdict: TriageVerdict,
        removed: PendingReviewRemovedBit?,
        note: String? = nil,
        reasonCode: String? = nil,
        dwellMs: Int? = nil
    ) {
        self.bitId = bitId
        self.verdict = verdict
        self.removed = removed
        self.note = note
        self.reasonCode = reasonCode
        self.dwellMs = dwellMs
    }

    var decision: TriageDecision {
        TriageDecision(bitId: bitId, verdict: verdict, note: note, reasonCode: reasonCode, dwellMs: dwellMs)
    }
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

    mutating func updateFeedback(bitId: String, note: String?, reasonCode: String?) -> Bool {
        guard !baseline.contains(bitId), let index = entries.firstIndex(where: { $0.bitId == bitId }) else { return false }

        entries[index].note = note
        entries[index].reasonCode = reasonCode

        return true
    }

    func title(for bitId: String) -> String? {
        entries.first { $0.bitId == bitId }?.removed?.bit.body
    }

    mutating func markBaseline() {
        baseline = Set(entries.map(\.bitId))
    }

    func sessionDecisions(earlier: [TriageDecision] = []) -> [TriageDecision] {
        let current = entries
            .filter { !baseline.contains($0.bitId) }
            .map(\.decision)
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
