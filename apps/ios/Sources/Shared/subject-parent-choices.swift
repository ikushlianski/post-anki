import PostAnkiAPI

enum SubjectParentChoices {
    static func list(from tree: [SubjectTreeNode]) -> [(id: String, label: String)] {
        var result: [(id: String, label: String)] = []

        func walk(_ nodes: [SubjectTreeNode], prefix: [String]) {
            for node in nodes {
                let path = prefix + [node.entry.name]

                result.append((node.id, path.joined(separator: " › ")))
                walk(node.children, prefix: path)
            }
        }

        walk(tree, prefix: [])

        return result
    }
}
