import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class AddKnowledgeSubjectPickerModel {
    var subjects: [Subject] = []
    var selectedId: String?
    var loadFailed = false

    var tree: [SubjectTreeNode] { SubjectTreePath.tree(from: subjects) }

    func load() async {
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

    var body: some View {
        Section {
            if SubjectTreePath.hasChildren(model.tree) {
                SubjectTreePicker(title: "Subject", nodes: model.tree, selection: $model.selectedId)
            } else {
                Picker("Subject", selection: $model.selectedId) {
                    Text("No subject").foregroundStyle(.primary).tag(String?.none)

                    ForEach(model.subjects) { subject in
                        Text(subject.name).foregroundStyle(.primary).tag(String?.some(subject.id))
                    }
                }
            }

            if model.loadFailed {
                Text("Couldn't load your subjects. You can still add without one.")
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .task { await model.load() }
    }
}
