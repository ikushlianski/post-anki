import PostAnkiAPI
import SwiftUI

private enum CourseEditTarget: Identifiable {
    case newModule
    case renameModule(Module)
    case newTopic(Module)
    case renameTopic(Topic)
    case commentModule(Module)
    case commentTopic(Topic)

    var id: String {
        switch self {
        case .newModule: "new-module"
        case .renameModule(let module): "rename-module-\(module.id)"
        case .newTopic(let module): "new-topic-\(module.id)"
        case .renameTopic(let topic): "rename-topic-\(topic.id)"
        case .commentModule(let module): "comment-module-\(module.id)"
        case .commentTopic(let topic): "comment-topic-\(topic.id)"
        }
    }
}

struct CourseEditScreen: View {
    let onClose: () -> Void

    @State private var model: CourseEditModel
    @State private var target: CourseEditTarget?
    @State private var deletingModule: Module?
    @State private var deletingTopic: Topic?
    @State private var orderingModules = false
    #if os(macOS)
    @State private var selection: Set<String> = []
    #endif

    init(curriculum: Curriculum, onClose: @escaping () -> Void) {
        self.onClose = onClose
        _model = State(initialValue: CourseEditModel(curriculum: curriculum))
    }

    var body: some View {
        list
        #if os(iOS)
        .environment(\.editMode, orderingModules ? .constant(.active) : nil)
        #endif
        .navigationTitle("Edit course")
        .inlineNavigationTitle()
        .toolbar {
            ToolbarItemGroup(placement: .trailingBar) {
                Button(orderingModules ? "Done" : "Order modules") { orderingModules.toggle() }
                    .disabled(model.modules.count < 2)

                #if os(iOS)
                if !orderingModules {
                    EditButton()
                }
                #endif

                Button { target = .newModule } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Add module")
                    .help("Add module")
            }
        }
        .sheet(item: $target) { sheet(for: $0).macSheetMinSize(width: 420, height: 220) }
        .confirmationDialog(
            "Delete \(deletingModule?.title ?? "") and its \(deletingModule?.topics.count ?? 0) topics?",
            isPresented: Binding(get: { deletingModule != nil }, set: { if !$0 { deletingModule = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                guard let module = deletingModule else { return }

                deletingModule = nil
                Task { await model.deleteModule(module) }
            }
            Button("Cancel", role: .cancel) { deletingModule = nil }
        }
        .confirmationDialog(
            "Delete \(deletingTopic?.title ?? "")? Its study history in this course is removed.",
            isPresented: Binding(get: { deletingTopic != nil }, set: { if !$0 { deletingTopic = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                guard let topic = deletingTopic else { return }

                deletingTopic = nil
                Task { await model.deleteTopic(topic) }
            }
            Button("Cancel", role: .cancel) { deletingTopic = nil }
        }
        .disabled(model.isWorking)
        .refreshable { await model.load() }
        .task { await model.load() }
        .onDisappear {
            if model.didChange { onClose() }
        }
    }

    @ViewBuilder
    private var list: some View {
        #if os(macOS)
        List(selection: $selection) { rows }
            .contextMenu(forSelectionType: String.self) { ids in
                if let topic = topic(in: ids) {
                    Button("Rename") { target = .renameTopic(topic) }
                    Button("Comment") { target = .commentTopic(topic) }
                    Button("Delete", role: .destructive) { deletingTopic = topic }
                }
            } primaryAction: { ids in
                if let topic = topic(in: ids) { target = .renameTopic(topic) }
            }
            .onDeleteCommand {
                if let topic = topic(in: selection) { deletingTopic = topic }
            }
        #else
        List { rows }
        #endif
    }

    #if os(macOS)
    private func topic(in ids: Set<String>) -> Topic? {
        guard ids.count == 1, let id = ids.first else { return nil }

        return model.modules.flatMap(\.topics).first { $0.id == id }
    }
    #endif

    @ViewBuilder
    private var rows: some View {
        if let notice = model.notice {
            Text(notice).foregroundStyle(.green)
        }

        if let errorMessage = model.errorMessage {
            Text(errorMessage).foregroundStyle(.red)
            Button("Try again") { Task { await model.load() } }
        } else if model.isLoading && !model.hasLoaded {
            ProgressView()
        } else if model.hasLoaded && model.modules.isEmpty {
            Text("No modules yet").foregroundStyle(.secondary)
        }

        if orderingModules {
            Section("Drag to reorder modules") {
                ForEach(model.modules) { module in
                    Text(module.title)
                }
                .onMove { offsets, destination in
                    Task { await model.moveModules(from: offsets, to: destination) }
                }
            }
        } else {
            ForEach(model.modules) { module in
                moduleSection(module)
            }
        }
    }

    private func moduleSection(_ module: Module) -> some View {
        Section {
            ForEach(module.topics) { topic in
                topicRow(topic)
            }
            .onMove { offsets, destination in
                Task { await model.moveTopics(in: module, from: offsets, to: destination) }
            }

            Button("Add topic") { target = .newTopic(module) }
        } header: {
            HStack {
                Text(module.title)

                Spacer()

                Menu {
                    Button("Rename") { target = .renameModule(module) }
                    Button("Comment") { target = .commentModule(module) }
                    Button("Delete", role: .destructive) { deletingModule = module }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("Module actions")
                .help("Module actions")
            }
        }
    }

    @ViewBuilder
    private func topicRow(_ topic: Topic) -> some View {
        #if os(macOS)
        Text(topic.title).tag(topic.id)
        #else
        Text(topic.title)
            .contextMenu {
                Button("Rename") { target = .renameTopic(topic) }
                Button("Comment") { target = .commentTopic(topic) }
                Button("Delete", role: .destructive) { deletingTopic = topic }
            }
        #endif
    }

    @ViewBuilder
    private func sheet(for target: CourseEditTarget) -> some View {
        switch target {
        case .newModule:
            CourseEditTitleSheet(heading: "Add module") { SheetFailure.message(await model.addModule(title: $0), model.errorMessage) }
        case .renameModule(let module):
            CourseEditTitleSheet(heading: "Rename module", initialTitle: module.title) {
                SheetFailure.message(await model.renameModule(module, to: $0), model.errorMessage)
            }
        case .newTopic(let module):
            CourseEditTitleSheet(heading: "Add topic") { SheetFailure.message(await model.addTopic(to: module, title: $0), model.errorMessage) }
        case .renameTopic(let topic):
            CourseEditTitleSheet(heading: "Rename topic", initialTitle: topic.title) {
                SheetFailure.message(await model.renameTopic(topic, to: $0), model.errorMessage)
            }
        case .commentModule(let module):
            CourseEditCommentSheet(heading: "Comment on module") { SheetFailure.message(await model.comment(on: module, text: $0), model.errorMessage) }
        case .commentTopic(let topic):
            CourseEditCommentSheet(heading: "Comment on topic") { SheetFailure.message(await model.comment(on: topic, text: $0), model.errorMessage) }
        }
    }
}
