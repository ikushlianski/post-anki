import PostAnkiAPI
import SwiftUI

struct SubjectCategoryScreen: View {
    @State private var model: SubjectCategoryModel
    @State private var showNew = false
    @State private var renaming: SubjectCategory?
    @State private var moving: SubjectCategory?

    init(subject: SubjectManageSubject) {
        _model = State(initialValue: SubjectCategoryModel(subject: subject))
    }

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
                Button("Try again") { Task { await model.load() } }
            } else if model.isLoading && !model.hasLoaded {
                ProgressView()
            } else if model.hasLoaded && model.categories.isEmpty && model.courses.isEmpty {
                Text("No categories or subjects yet.").foregroundStyle(.secondary)
            }

            ForEach(model.rows) { row in
                Section {
                    ForEach(model.courses(in: row.category.id)) { course in
                        courseRow(course)
                    }
                } header: {
                    Text(row.category.name)
                        .zoomPadding(.leading, CGFloat(row.depth) * 16)
                        .contextMenu {
                            Button("Rename") { renaming = row.category }
                            Button("Move into...") { moving = row.category }
                        }
                }
            }

            if !model.uncategorised.isEmpty {
                Section("Not in a category") {
                    ForEach(model.uncategorised) { course in
                        courseRow(course)
                    }
                }
            }
        }
        .navigationTitle(model.subject.name)
        .inlineNavigationTitle()
        .toolbar {
            ToolbarItem(placement: .trailingBar) {
                Button { showNew = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("New category")
                    .help("New category")
            }
        }
        .sheet(isPresented: $showNew) {
            SubjectCategoryNewSheet(categories: model.categories) { name, parentId in
                await model.create(name: name, parentId: parentId)
            }
            .macSheetMinSize()
        }
        .sheet(item: $renaming) { category in
            SubjectRenameSheet(title: "Rename category", currentName: category.name) { name in
                SheetFailure.message(await model.rename(category, to: name), model.errorMessage)
            }
            .macSheetMinSize()
        }
        .confirmationDialog(
            "Move \(moving?.name ?? "") into",
            isPresented: Binding(get: { moving != nil }, set: { if !$0 { moving = nil } }),
            titleVisibility: .visible
        ) {
            if let category = moving {
                Button("Top level") { Task { await model.move(category, into: nil) } }

                ForEach(model.moveCandidates(for: category)) { target in
                    Button(target.name) { Task { await model.move(category, into: target.id) } }
                }
            }
        }
        .disabled(model.isWorking)
        #if os(macOS)
        .toolbar {
            ToolbarItem {
                Button { Task { await model.load() } } label: { Label("Reload", systemImage: "arrow.clockwise") }
                    .keyboardShortcut("r", modifiers: .command)
                    .disabled(model.isLoading)
            }
        }
        #endif
        .refreshable { await model.load() }
        .task { await model.load() }
    }

    private func courseRow(_ course: SubjectManageCourse) -> some View {
        HStack {
            Text(course.name)

            Spacer()

            Menu {
                Button("No category") { Task { await model.put(course, in: nil) } }

                ForEach(model.categories) { category in
                    Button(category.name) { Task { await model.put(course, in: category.id) } }
                }
            } label: {
                Image(systemName: "folder")
            }
            .accessibilityLabel("Put in category")
            .help("Put in category")
        }
    }
}

struct SubjectCategoryNewSheet: View {
    let categories: [SubjectCategory]
    let onCreate: (String, String?) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var parentId: String?
    @State private var isSaving = false

    private var trimmed: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $name)

                Picker("Inside", selection: $parentId) {
                    Text("Top level").tag(String?.none)

                    ForEach(categories) { category in
                        Text(category.name).tag(String?.some(category.id))
                    }
                }
            }
            .navigationTitle("New category")
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task {
                            isSaving = true

                            if await onCreate(trimmed, parentId) { dismiss() }

                            isSaving = false
                        }
                    }
                    .disabled(trimmed.isEmpty || isSaving)
                }
            }
        }
    }
}
