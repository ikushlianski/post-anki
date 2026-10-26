import Observation
import PostAnkiAPI

struct SubjectTreeEntry: Equatable, Identifiable {
    let id: String
    let name: String
    let count: Int
    let newCount: Int
    let learningCount: Int
    let matureCount: Int
    let isUnsorted: Bool
}

struct SubjectTreeNode: Equatable, Identifiable {
    let entry: SubjectTreeEntry
    let children: [SubjectTreeNode]

    var id: String { entry.id }
}

struct SubjectTreeRow: Equatable, Identifiable {
    let node: SubjectTreeNode
    let depth: Int
    let isExpanded: Bool

    var id: String { node.id }
}

enum SubjectTree {
    static let unsortedId = "none"

    static func build(subjects: [Subject], counts: [KnowledgeBrowserSubjectCount]) -> [SubjectTreeNode] {
        let direct = Dictionary(counts.compactMap { row in row.subjectId.map { ($0, row) } }, uniquingKeysWith: { first, _ in first })
        let known = Set(subjects.map(\.id))
        var childrenByParent: [String: [Subject]] = [:]
        var roots: [Subject] = []

        for subject in subjects {
            if let parent = subject.parentId, parent != subject.id, known.contains(parent) {
                childrenByParent[parent, default: []].append(subject)
            } else {
                roots.append(subject)
            }
        }

        var nodes = roots.sorted(by: byName).compactMap {
            node(for: $0, direct: direct, childrenByParent: childrenByParent, visited: [])
        }

        if let unsorted = counts.first(where: { $0.subjectId == nil }), unsorted.count > 0 {
            nodes.append(SubjectTreeNode(entry: SubjectTreeEntry(
                id: unsortedId,
                name: "No subject",
                count: unsorted.count,
                newCount: unsorted.newCount,
                learningCount: unsorted.learningCount,
                matureCount: unsorted.matureCount,
                isUnsorted: true
            ), children: []))
        }

        return nodes
    }

    static func visibleRows(_ nodes: [SubjectTreeNode], expanded: Set<String>, depth: Int = 0) -> [SubjectTreeRow] {
        nodes.flatMap { node -> [SubjectTreeRow] in
            let isExpanded = expanded.contains(node.id) && !node.children.isEmpty
            let row = SubjectTreeRow(node: node, depth: depth, isExpanded: isExpanded)

            return [row] + (isExpanded ? visibleRows(node.children, expanded: expanded, depth: depth + 1) : [])
        }
    }

    private static func byName(_ left: Subject, _ right: Subject) -> Bool {
        left.name.localizedCaseInsensitiveCompare(right.name) == .orderedAscending
    }

    private static func node(
        for subject: Subject,
        direct: [String: KnowledgeBrowserSubjectCount],
        childrenByParent: [String: [Subject]],
        visited: Set<String>
    ) -> SubjectTreeNode? {
        guard !visited.contains(subject.id) else { return nil }

        let path = visited.union([subject.id])
        let children = (childrenByParent[subject.id] ?? []).sorted(by: byName).compactMap {
            node(for: $0, direct: direct, childrenByParent: childrenByParent, visited: path)
        }
        let own = direct[subject.id]
        let entry = SubjectTreeEntry(
            id: subject.id,
            name: subject.name,
            count: (own?.count ?? 0) + children.reduce(0) { $0 + $1.entry.count },
            newCount: (own?.newCount ?? 0) + children.reduce(0) { $0 + $1.entry.newCount },
            learningCount: (own?.learningCount ?? 0) + children.reduce(0) { $0 + $1.entry.learningCount },
            matureCount: (own?.matureCount ?? 0) + children.reduce(0) { $0 + $1.entry.matureCount },
            isUnsorted: false
        )

        return SubjectTreeNode(entry: entry, children: children)
    }
}

struct SubjectDepthFractions: Equatable {
    let mature: Double
    let learning: Double
    let new: Double

    init(entry: SubjectTreeEntry) {
        let total = Double(entry.count)

        guard total > 0 else {
            mature = 0
            learning = 0
            new = 0

            return
        }

        mature = Double(entry.matureCount) / total
        learning = Double(entry.learningCount) / total
        new = Double(entry.newCount) / total
    }
}

@Observable
@MainActor
final class SubjectTreeScreenModel {
    private(set) var subjects: [Subject] = []
    private(set) var tree: [SubjectTreeNode] = []
    var expanded: Set<String> = []
    private(set) var isLoading = false
    private(set) var hasLoaded = false
    private(set) var errorMessage: String?
    private(set) var failure: ProgressLoadError?

    var rows: [SubjectTreeRow] { SubjectTree.visibleRows(tree, expanded: expanded) }

    func toggle(_ id: String) {
        if expanded.contains(id) {
            expanded.remove(id)
        } else {
            expanded.insert(id)
        }
    }

    func subject(for id: String) -> Subject? {
        subjects.first { $0.id == id }
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        failure = nil
        defer { isLoading = false }

        do {
            async let subjectsTask = APIClient.listSubjects()
            async let countsTask = APIClient.knowledgeBrowserSubjectCounts()
            let loadedSubjects = try await subjectsTask
            let counts = try await countsTask

            subjects = loadedSubjects
            tree = SubjectTree.build(subjects: loadedSubjects, counts: counts)
            hasLoaded = true
        } catch is CancellationError {
            return
        } catch {
            errorMessage = "Couldn't load your subjects."
            failure = ProgressLoadError.from(error)
        }
    }
}
