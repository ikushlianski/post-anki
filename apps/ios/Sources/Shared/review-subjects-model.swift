import Observation
import PostAnkiAPI

struct ReviewSubjectRow: Equatable, Identifiable {
    let row: SubjectTreeRow
    let dueCount: Int
    let newCount: Int

    var id: String { row.id }
    var entry: SubjectTreeEntry { row.node.entry }
    var summary: String { ReviewSubjectSummary.text(due: dueCount, new: newCount) }
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
    private(set) var dueError: String?

    var hasLoaded: Bool { tree.hasLoaded }
    var errorMessage: String? { tree.errorMessage }
    var totalDue: Int { tree.tree.reduce(0) { $0 + due(for: $1.id) } + unsorted.dueCount }
    var totalNew: Int { tree.tree.reduce(0) { $0 + newCount(for: $1.id) } + unsorted.newCount }

    var rows: [ReviewSubjectRow] {
        tree.rows.map { ReviewSubjectRow(row: $0, dueCount: due(for: $0.id), newCount: newCount(for: $0.id)) }
    }

    func subject(for id: String) -> Subject? { tree.subject(for: id) }
    func toggle(_ id: String) { tree.toggle(id) }

    func load() async {
        async let dueTask: SubjectReviewDueCounts? = try? await APIClient.subjectReviewDueCounts()

        await tree.load()

        if let counts = await dueTask {
            dueBySubject = Dictionary(counts.subjects.map { ($0.subjectId, $0) }, uniquingKeysWith: { first, _ in first })
            unsorted = counts.unsorted
            dueError = nil
        } else {
            dueError = "Couldn't load due counts."
        }
    }

    private func due(for id: String) -> Int { dueBySubject[id]?.dueCount ?? 0 }
    private func newCount(for id: String) -> Int { dueBySubject[id]?.newCount ?? 0 }
}
