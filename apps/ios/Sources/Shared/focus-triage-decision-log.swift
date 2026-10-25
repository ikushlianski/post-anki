import PostAnkiAPI

struct FocusTriageDecisionEntry {
    let bitId: String
    let verdict: TriageVerdict
    let removed: PendingReviewRemovedBit?
    let front: String?
    var note: String?
    var reasonCode: String?
    var dwellMs: Int?

    init(
        bitId: String,
        verdict: TriageVerdict,
        removed: PendingReviewRemovedBit?,
        front: String? = nil,
        note: String? = nil,
        reasonCode: String? = nil,
        dwellMs: Int? = nil
    ) {
        self.bitId = bitId
        self.verdict = verdict
        self.removed = removed
        self.front = front
        self.note = note
        self.reasonCode = reasonCode
        self.dwellMs = dwellMs
    }

    static func frontText(of bit: PendingReviewBit) -> String {
        let prompt = PendingReviewTriageSelection.bestVariant(in: bit.variants)?.prompt
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if let prompt, !prompt.isEmpty { return prompt }

        return bit.body
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
        guard let entry = entries.first(where: { $0.bitId == bitId }) else { return nil }

        return entry.front ?? entry.removed.map { FocusTriageDecisionEntry.frontText(of: $0.bit) }
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
