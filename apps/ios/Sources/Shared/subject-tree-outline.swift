import SwiftUI

struct SubjectTreeOutline: View {
    let nodes: [SubjectTreeNode]
    @Binding var selection: String?
    @State private var expanded: Set<String> = []
    @State private var seeded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            choice(id: nil, name: "No subject", depth: 0, node: nil)

            ForEach(nodes) { node in
                branch(node, depth: 0)
            }
        }
        .onAppear(perform: seedExpansion)
    }

    private func branch(_ node: SubjectTreeNode, depth: Int) -> AnyView {
        AnyView(
            VStack(alignment: .leading, spacing: 2) {
                choice(id: node.id, name: node.entry.name, depth: depth, node: node)

                if expanded.contains(node.id) {
                    ForEach(node.children) { child in
                        branch(child, depth: depth + 1)
                    }
                }
            }
        )
    }

    private func choice(id: String?, name: String, depth: Int, node: SubjectTreeNode?) -> some View {
        HStack(spacing: 6) {
            toggle(node)

            Button {
                selection = id
            } label: {
                HStack {
                    Text(name).foregroundStyle(.primary)
                    Spacer()

                    if selection == id {
                        Image(systemName: "checkmark").foregroundStyle(.tint)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, CGFloat(depth) * 18)
        .padding(.vertical, 2)
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func toggle(_ node: SubjectTreeNode?) -> some View {
        if let node, !node.children.isEmpty {
            Button {
                if expanded.contains(node.id) { expanded.remove(node.id) } else { expanded.insert(node.id) }
            } label: {
                Image(systemName: expanded.contains(node.id) ? "minus.square" : "plus.square")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(expanded.contains(node.id) ? "Collapse \(node.entry.name)" : "Expand \(node.entry.name)")
        } else {
            Color.clear.frame(width: 16, height: 16)
        }
    }

    private func seedExpansion() {
        guard !seeded else { return }

        seeded = true

        guard let selection, let path = SubjectTreePath.ids(to: selection, in: nodes) else { return }

        expanded.formUnion(path.dropLast())
    }
}
