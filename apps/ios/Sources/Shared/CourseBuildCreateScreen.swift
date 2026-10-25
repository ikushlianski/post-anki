import PostAnkiAPI
import SwiftUI

struct CourseBuildCreateScreen: View {
    @State private var model = CourseBuildCreateModel()

    var body: some View {
        Form {
            Section {
                Picker("Subject", selection: $model.subjectId) {
                    ForEach(model.subjects) { subject in
                        Text(subject.name).tag(String?.some(subject.id))
                    }
                }

                if !model.categories.isEmpty {
                    Picker("Category", selection: $model.categoryId) {
                        Text("No category").tag(String?.none)

                        ForEach(model.categories) { category in
                            Text(category.name).tag(String?.some(category.id))
                        }
                    }
                }

                TextField("Subject name", text: $model.name)
                TextField("Description (optional)", text: $model.details)
            }

            Section("Where should it come from?") {
                Picker("Start from", selection: $model.mode) {
                    ForEach(CourseBuildMode.allCases) { Text($0.rawValue).tag($0) }
                }

                modeFields
            }

            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }

            Section {
                createButton
            }
        }
        #if os(macOS)
        .formStyle(.grouped)
        #endif
        .navigationTitle("New subject")
        .reportsUnsentInput("subject-create", model.hasInput)
        .inlineNavigationTitle()
        .navigationDestination(item: $model.created) { course in
            CourseBuildScreen(courseId: course.id, title: course.name)
        }
        .task { await model.loadSubjects() }
    }

    @ViewBuilder
    private var createButton: some View {
        let button = Button("Create subject") { Task { await model.create() } }
            .disabled(!model.canCreate)

        #if os(macOS)
        button.keyboardShortcut(.return, modifiers: .command)
        #else
        button
        #endif
    }

    @ViewBuilder
    private var modeFields: some View {
        switch model.mode {
        case .links:
            ForEach(model.links.indices, id: \.self) { index in
                TextField("https://...", text: $model.links[index])
                    .urlTextInput()
                    .autocorrectionDisabled()
            }

            Button("Add another link") { model.links.append("") }
        case .research:
            TextField("Topic to research", text: $model.topic)
        case .document:
            TextField("https://docs...", text: $model.documentURL)
                .urlTextInput()
                .autocorrectionDisabled()
        case .paste:
            TextField("Paste your material", text: $model.material, axis: .vertical)
                .lineLimit(5...12)
        }
    }
}
