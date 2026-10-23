import PostAnkiAPI
import SwiftUI

struct DomainNodeScreen: View {
    let siblings: [DomainNodeItem]
    let onChanged: () -> Void

    @State private var model: DomainNodeModel
    @State private var showMerge = false
    @Environment(\.dismiss) private var dismiss

    init(node: DomainNodeItem, siblings: [DomainNodeItem], onChanged: @escaping () -> Void) {
        _model = State(initialValue: DomainNodeModel(node: node))
        self.siblings = siblings
        self.onChanged = onChanged
    }

    var body: some View {
        List {
            if let notice = model.notice {
                Text(notice).foregroundStyle(.green)
            }

            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }

            Section("Target depth") {
                Picker("Depth", selection: $model.depth) {
                    Text("Not set").tag(String?.none)

                    ForEach(DomainDepth.all, id: \.self) { depth in
                        Text(DomainDepth.label(depth)).tag(Optional(depth))
                    }
                }
                .disabled(model.isBusy)
                .onChange(of: model.depth) { _, newDepth in
                    Task {
                        await model.saveDepth(newDepth)
                        onChanged()
                    }
                }
            }

            Section("Courses") {
                if model.node.curricula.isEmpty {
                    Text("No courses cover this area yet.").foregroundStyle(.secondary)
                }

                ForEach(model.node.curricula) { course in
                    NavigationLink(course.name) {
                        DomainMappingScreen(
                            curriculumId: course.id,
                            courseName: course.name,
                            subjectId: model.node.subjectId
                        )
                    }
                }
            }

            Section {
                Button("Merge another area into this one") { showMerge = true }
                    .disabled(model.isBusy)
            }
        }
        .navigationTitle(model.node.name)
        .sheet(isPresented: $showMerge) {
            DomainNodeMergeSheet(
                target: model.node,
                candidates: siblings.filter { $0.id != model.node.id && $0.subjectId == model.node.subjectId }
            ) { source in
                let merged = await model.merge(source)

                if merged {
                    onChanged()
                    dismiss()
                }
            }
            .macSheetMinSize()
        }
    }
}

struct DomainNodeMergeSheet: View {
    let target: DomainNodeItem
    let candidates: [DomainNodeItem]
    let onMerge: (DomainNodeItem) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var chosen: DomainNodeItem?

    var body: some View {
        NavigationStack {
            List(candidates) { node in
                Button(node.name) { chosen = node }
                    .foregroundStyle(.primary)
            }
            .navigationTitle("Merge which area?")
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .confirmationDialog(
                "Merge \(chosen?.name ?? "") into \(target.name)? Its courses and sub-areas move here and \(chosen?.name ?? "") is removed.",
                isPresented: Binding(get: { chosen != nil }, set: { if !$0 { chosen = nil } }),
                titleVisibility: .visible
            ) {
                Button("Merge", role: .destructive) {
                    guard let source = chosen else { return }

                    Task {
                        await onMerge(source)
                        dismiss()
                    }
                }
            }
        }
    }
}
