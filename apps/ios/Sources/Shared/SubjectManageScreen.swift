import PostAnkiAPI
import SwiftUI

struct SubjectManageScreen: View {
    let onChange: () -> Void

    @State private var model = SubjectManageModel()
    @State private var showNew = false
    @State private var renaming: SubjectManageSubject?
    @State private var merging: SubjectManageSubject?
    @State private var deleting: SubjectManageSubject?

    var body: some View {
        List {
            if let notice = model.notice {
                Text(notice).foregroundStyle(.green)
            }

            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
                Button("Try again") { Task { await model.load() } }
            } else if model.isLoading && !model.hasLoaded {
                ProgressView()
            } else if model.hasLoaded && model.subjects.isEmpty {
                Text("No subjects yet.").foregroundStyle(.secondary)
            }

            group(title: "Subjects", parentId: nil)

            ForEach(model.parents) { parent in
                group(title: "Inside \(parent.name)", parentId: parent.id)
            }
        }
        .navigationTitle("Manage subjects")
        .toolbar {
            #if os(iOS)
            ToolbarItem(placement: .trailingBar) {
                EditButton()
            }
            #endif
        }
        .mainActionControls([MainActionTile(title: "New subject", style: .prominent) { showNew = true }])
        .sheet(isPresented: $showNew) {
            SubjectNewSheet(subjects: model.subjects) { name, parentId in
                SheetFailure.message(await model.create(name: name, parentId: parentId), model.errorMessage)
            }
        }
        .sheet(item: $renaming) { subject in
            SubjectRenameSheet(title: "Rename subject", currentName: subject.name) { name in
                SheetFailure.message(await model.rename(subject, to: name), model.errorMessage)
            }
        }
        .sheet(item: $merging) { source in
            SubjectMergeSheet(source: source, candidates: model.mergeCandidates(for: source)) { target in
                SheetFailure.message(await model.merge(source: source, into: target), model.errorMessage)
            }
        }
        .confirmationDialog(
            deleteMessage,
            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                guard let subject = deleting else { return }

                deleting = nil
                Task { await model.delete(subject) }
            }
            Button("Cancel", role: .cancel) { deleting = nil }
        }
        .disabled(model.isWorking)
        .refreshable { await model.load() }
        .task { await model.load() }
        .onDisappear {
            if model.didChange { onChange() }
        }
    }

    private var deleteMessage: String {
        guard let subject = deleting else { return "" }

        let count = model.courseCount(of: subject.id)

        return "Delete \(subject.name)? Its \(count) \(count == 1 ? "subject is" : "subjects are") deleted too. Subjects inside it move up a level."
    }

    @ViewBuilder
    private func group(title: String, parentId: String?) -> some View {
        let items = model.children(of: parentId)

        if !items.isEmpty {
            Section(title) {
                ForEach(items) { subject in
                    NavigationLink {
                        SubjectCategoryScreen(subject: subject)
                    } label: {
                        Text(subject.name)
                    }
                    .contextMenu {
                        Button("Rename") { renaming = subject }
                        Button("Merge into...") { merging = subject }
                        Button("Delete", role: .destructive) { deleting = subject }
                    }
                }
                .onMove { offsets, destination in
                    Task { await model.move(parentId: parentId, from: offsets, to: destination) }
                }
            }
        }
    }
}
