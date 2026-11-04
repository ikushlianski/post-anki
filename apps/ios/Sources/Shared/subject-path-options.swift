import PostAnkiAPI

struct SubjectPathOption: Identifiable, Equatable {
    let id: String
    let label: String
    let isParent: Bool
}

extension SubjectTreePath {
    static func options(from subjects: [Subject]) -> [SubjectPathOption] {
        flatten(tree(from: subjects), prefix: [])
    }

    private static func flatten(_ nodes: [SubjectTreeNode], prefix: [String]) -> [SubjectPathOption] {
        nodes.flatMap { node -> [SubjectPathOption] in
            let path = prefix + [node.entry.name]
            let option = SubjectPathOption(
                id: node.id,
                label: path.joined(separator: separator),
                isParent: !node.children.isEmpty
            )

            return [option] + flatten(node.children, prefix: path)
        }
    }
}
