import PostAnkiAPI
import SwiftUI

enum SubjectTreePath {
    static let separator = " > "

    static func names(to id: String, in nodes: [SubjectTreeNode]) -> [String]? {
        for node in nodes {
            if node.id == id { return [node.entry.name] }

            if let rest = names(to: id, in: node.children) { return [node.entry.name] + rest }
        }

        return nil
    }

    static func label(for id: String?, in nodes: [SubjectTreeNode]) -> String? {
        id.flatMap { names(to: $0, in: nodes) }?.joined(separator: separator)
    }

    static func hasChildren(_ nodes: [SubjectTreeNode]) -> Bool {
        nodes.contains { !$0.children.isEmpty }
    }

    static func tree(from subjects: [Subject]) -> [SubjectTreeNode] {
        SubjectTree.build(subjects: subjects, counts: [])
    }
}

struct SubjectTreePicker: View {
    let title: String
    let nodes: [SubjectTreeNode]
    @Binding var selection: String?
    @State private var isPresented = false

    var body: some View {
        Button {
            isPresented = true
        } label: {
            HStack {
                Text(title).foregroundStyle(.primary)
                Spacer()
                Text(SubjectTreePath.label(for: selection, in: nodes) ?? "No subject")
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.trailing)
                Image(systemName: "chevron.right")
                    .zoomFont(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .sheet(isPresented: $isPresented) {
            NavigationStack {
                SubjectTreePickerLevel(title: title, parent: nil, nodes: nodes, selection: selection) { id in
                    selection = id
                    isPresented = false
                }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { isPresented = false }
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
    }
}

struct SubjectTreePickerLevel: View {
    let title: String
    let parent: SubjectTreeNode?
    let nodes: [SubjectTreeNode]
    let selection: String?
    let onPick: (String?) -> Void

    var body: some View {
        List {
            if let parent {
                row("Use \(parent.entry.name)", isSelected: selection == parent.id) { onPick(parent.id) }
            } else {
                row("No subject", isSelected: selection == nil) { onPick(nil) }
            }

            ForEach(nodes) { node in
                if node.children.isEmpty {
                    row(node.entry.name, isSelected: selection == node.id) { onPick(node.id) }
                } else {
                    NavigationLink {
                        SubjectTreePickerLevel(
                            title: node.entry.name,
                            parent: node,
                            nodes: node.children,
                            selection: selection,
                            onPick: onPick
                        )
                    } label: {
                        HStack {
                            Text(node.entry.name)
                            Spacer()

                            if selection == node.id {
                                Image(systemName: "checkmark").foregroundStyle(.tint)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(title)
    }

    private func row(_ text: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Text(text).foregroundStyle(.primary)
                Spacer()

                if isSelected {
                    Image(systemName: "checkmark").foregroundStyle(.tint)
                }
            }
        }
    }
}
