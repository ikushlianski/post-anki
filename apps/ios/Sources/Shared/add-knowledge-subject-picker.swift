import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class AddKnowledgeSubjectPickerModel {
    var subjects: [Subject] = []
    var selectedId: String?
    var loadFailed = false
    var isExpanded = false
    private let isPreloaded: Bool

    init() {
        isPreloaded = false
    }

    init(subjects: [Subject], selectedId: String? = nil, loadFailed: Bool = false, isExpanded: Bool = false) {
        isPreloaded = true
        self.subjects = subjects
        self.selectedId = selectedId
        self.loadFailed = loadFailed
        self.isExpanded = isExpanded
    }

    var tree: [SubjectTreeNode] { SubjectTreePath.tree(from: subjects) }

    var pathLabel: String? {
        SubjectTreePath.label(for: selectedId, in: tree)?
            .replacingOccurrences(of: SubjectTreePath.separator, with: " › ")
    }

    func load() async {
        guard !isPreloaded else { return }

        do {
            subjects = try await APIClient.listSubjects()
            loadFailed = false

            if let selectedId, !subjects.contains(where: { $0.id == selectedId }) {
                self.selectedId = nil
            }
        } catch {
            subjects = []
            loadFailed = true
        }
    }
}

struct AddKnowledgeSubjectPicker: View {
    @Bindable var model: AddKnowledgeSubjectPickerModel

    private var canExpand: Bool { !model.subjects.isEmpty }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(.easeOut(duration: 0.15)) { model.isExpanded.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "folder").foregroundStyle(.secondary)
                    Text("Subject").foregroundStyle(.primary)
                    Spacer()
                    Text(model.pathLabel ?? "No subject")
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.head)

                    if canExpand {
                        Image(systemName: "chevron.right")
                            .zoomFont(.caption)
                            .foregroundStyle(.tertiary)
                            .rotationEffect(.degrees(model.isExpanded ? 90 : 0))
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!canExpand)
            .accessibilityIdentifier("add-knowledge-subject")

            if model.isExpanded && canExpand {
                Divider()
                SubjectTreeOutline(nodes: model.tree, selection: $model.selectedId)
            }
        }
        .padding(14)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .onChange(of: model.selectedId) { model.isExpanded = false }
        .task { await model.load() }
    }
}
