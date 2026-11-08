import Observation
import PostAnkiAPI

struct ReviewSubjectRow: Equatable, Identifiable {
    let row: SubjectTreeRow
    let dueCount: Int
    let newCount: Int
    var todayCount = 0

    var id: String { row.id }
    var entry: SubjectTreeEntry { row.node.entry }
    var summary: String { ReviewSubjectSummary.text(due: dueCount, new: newCount) }
    var maturity: CardMaturityBreakdown { CardMaturityBreakdown(entry: entry) }
}

enum ReviewSubjectSummary {
    static func text(due: Int, new: Int) -> String {
        if due == 0 && new == 0 { return "Nothing due" }

        return [due > 0 ? "\(due) due" : nil, new > 0 ? "\(new) new" : nil]
            .compactMap { $0 }
            .joined(separator: " · ")
    }
}

@Observable
@MainActor
final class ReviewSubjectsModel {
    let tree = SubjectTreeScreenModel()
    private(set) var dueBySubject: [String: SubjectReviewDueCount] = [:]
    private(set) var unsorted = SubjectReviewDueCounts.Bucket(dueCount: 0, newCount: 0)
    private(set) var reviewsRemainingToday: Int?
    private(set) var dueError: String?
    private(set) var dueFailureReason: String?

    var hasLoaded: Bool { tree.hasLoaded }
    private(set) var stalled = false
    var errorMessage: String? { tree.errorMessage ?? (stalled ? "Couldn't load subjects (request did not finish)" : nil) }
    var totalDue: Int { tree.tree.reduce(0) { $0 + due(for: $1.id) } + unsorted.dueCount }
    var totalToday: Int {
        let sum = tree.tree.reduce(0) { $0 + today(for: $1.id) } + unsorted.todayCount

        return reviewsRemainingToday.map { min(sum, $0) } ?? sum
    }

    var totalNew: Int { tree.tree.reduce(0) { $0 + newCount(for: $1.id) } + unsorted.newCount }

    var overallMaturity: CardMaturityBreakdown { CardMaturityBreakdown(counts: tree.counts) }

    var rows: [ReviewSubjectRow] {
        tree.rows.map { ReviewSubjectRow(row: $0, dueCount: due(for: $0.id), newCount: newCount(for: $0.id), todayCount: today(for: $0.id)) }
    }

    func subject(for id: String) -> Subject? { tree.subject(for: id) }
    func toggle(_ id: String) { tree.toggle(id) }

    func load() async {
        async let dueTask = Self.loadDueCounts()

        await tree.load()

        if !tree.hasLoaded, tree.errorMessage == nil, !Task.isCancelled {
            await tree.load()
        }

        stalled = !tree.hasLoaded && tree.errorMessage == nil && !Task.isCancelled

        let dueResult = await dueTask

        if let counts = dueResult.counts {
            dueBySubject = Dictionary(counts.subjects.map { ($0.subjectId, $0) }, uniquingKeysWith: { first, _ in first })
            unsorted = counts.unsorted
            reviewsRemainingToday = counts.reviewsRemainingToday
            dueError = nil
            dueFailureReason = nil

            if tree.hasLoaded { await DueBadge.updater.update(due: totalDue) }
        } else {
            dueError = "Couldn't load due counts."
            dueFailureReason = dueResult.failure
        }
    }

    private static func loadDueCounts() async -> (counts: SubjectReviewDueCounts?, failure: String?) {
        do {
            return (try await APIClient.subjectReviewDueCounts(), nil)
        } catch {
            return (nil, LoadFailureReason.describe(error))
        }
    }

    private func due(for id: String) -> Int { dueBySubject[id]?.dueCount ?? 0 }
    private func today(for id: String) -> Int { dueBySubject[id]?.todayCount ?? 0 }
    private func newCount(for id: String) -> Int { dueBySubject[id]?.newCount ?? 0 }
}
