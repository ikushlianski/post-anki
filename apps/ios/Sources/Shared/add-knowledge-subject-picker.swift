import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class AddKnowledgeSubjectPickerModel {
    var subjects: [Subject] = []
    var selectedId: String? {
        didSet { lastSubject?.save(selectedId) }
    }
    var loadFailed = false
    var isExpanded = false
    var isBusy = false
    var message: String?
    private let isPreloaded: Bool
    private let lastSubject: LastSubjectStoring?

    init(lastSubject: LastSubjectStoring? = nil) {
        isPreloaded = false
        self.lastSubject = lastSubject
        selectedId = lastSubject?.load()
    }

    init(subjects: [Subject], selectedId: String? = nil, loadFailed: Bool = false, isExpanded: Bool = false) {
        isPreloaded = true
        lastSubject = nil
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

    var parentChoices: [(id: String, label: String)] { SubjectParentChoices.list(from: tree) }

    func createAndSelect(name: String, parentId: String?) async -> Bool {
        guard !isBusy else { return false }

        isBusy = true
        message = nil
        defer { isBusy = false }

        do {
            let created = try await APIClient.createSubject(name: name, parentId: parentId)

            subjects.append(created)
            selectedId = created.id

            return true
        } catch {
            message = "Couldn't create the subject. Try again."

            return false
        }
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
    @State private var isCreating = false

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

            Button("New subject", systemImage: "plus") {
                model.message = nil
                isCreating = true
            }
            .buttonStyle(.borderless)
            .zoomFont(.caption)
            .accessibilityIdentifier("add-knowledge-new-subject")
        }
        .padding(14)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .onChange(of: model.selectedId) { model.isExpanded = false }
        .task { await model.load() }
        .sheet(isPresented: $isCreating) {
            NewSubjectForm(
                parentChoices: model.parentChoices,
                message: model.message,
                isBusy: model.isBusy,
                confirmTitle: "Create and select"
            ) { name, parentId in
                Task { if await model.createAndSelect(name: name, parentId: parentId) { isCreating = false } }
            }
        }
    }
}
