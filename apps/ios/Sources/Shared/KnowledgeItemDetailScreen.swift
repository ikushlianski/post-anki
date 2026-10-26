import PostAnkiAPI
import SwiftUI

struct KnowledgeItemDetailScreen: View {
    let item: KnowledgeOverviewItem
    let subjectName: String?
    let onStateChange: (String) -> Void
    let onDeleted: () -> Void
    let onMoved: (String) -> Void

    @State private var state: String
    @State private var isBusy = false
    @State private var message: String?
    @State private var actions: KnowledgeItemActionsModel
    @State private var variants: MoreVariantsModel
    @State private var editing = false
    @State private var choosingSubject = false
    @State private var confirmingDelete = false
    @Environment(\.dismiss) private var dismiss

    init(
        item: KnowledgeOverviewItem,
        subjectName: String?,
        onStateChange: @escaping (String) -> Void,
        onDeleted: @escaping () -> Void = {},
        onMoved: @escaping (String) -> Void = { _ in }
    ) {
        self.item = item
        self.subjectName = subjectName
        self.onStateChange = onStateChange
        self.onDeleted = onDeleted
        self.onMoved = onMoved
        _state = State(initialValue: item.state)
        _actions = State(initialValue: KnowledgeItemActionsModel(item: item))
        _variants = State(initialValue: MoreVariantsModel(bitId: item.id))
    }

    private var shownSubjectName: String? { actions.subjectName ?? subjectName }

    private var isSuspended: Bool { state == "suspended" }
    private var isBuried: Bool { state == "buried" }

    private var actionTitle: String {
        if isSuspended { return "Unsuspend" }

        return isBuried ? "Bring back today" : "Suspend"
    }

    var body: some View {
        List {
            Section("Question") { cardText(actions.question) }
            Section("Answer") { cardText(actions.answer) }

            SynonymsSection(bitId: item.id, question: actions.question)

            Section {
                LabeledContent("Status", value: KnowledgeOverviewItem.label(for: state))

                if let shownSubjectName { LabeledContent("Subject", value: shownSubjectName) }

                if let due = item.dueAt.flatMap({ DueReviewModel.nextDueText($0) }) {
                    LabeledContent("Due", value: due)
                }

                if item.lapses > 0 { LabeledContent("Lapses", value: String(item.lapses)) }
            }

            if let message = message ?? actions.message {
                Section { Text(message).zoomFont(.caption).foregroundStyle(.red) }
            }

            MoreVariantsSection(model: variants)
        }
        .navigationTitle("Item")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar { toolbar }
        .sheet(isPresented: $editing) {
            QuestionVariantEditSheet(prompt: actions.question, answer: actions.answer) { prompt, answer in
                await actions.edit(prompt: prompt, answer: answer)
            }
        }
        .sheet(isPresented: $choosingSubject) {
            KnowledgeMoveSheet(subjects: actions.subjects.filter { $0.id != actions.subjectId }) { subject in
                Task { if await actions.move(to: subject) { onMoved(subject.id) } }
            }
        }
        .confirmationDialog("Delete this item? This can't be undone.", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await delete() } }
            Button("Cancel", role: .cancel) {}
        }
        .task { await actions.loadSubjects() }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            Menu {
                Button("Edit", systemImage: "pencil") { editing = true }
                Button("Move to subject", systemImage: "folder") { choosingSubject = true }
                Button(actionTitle, systemImage: isSuspended ? "play.circle" : "pause.circle") {
                    Task { await toggle() }
                }
                Button("Generate more question variants", systemImage: "sparkles") {
                    Task { await variants.request() }
                }
                .disabled(variants.isBusy || variants.requested)

                Divider()

                Button("Delete", systemImage: "trash", role: .destructive) { confirmingDelete = true }
            } label: {
                Label("Actions", systemImage: "ellipsis.circle")
            }
            .disabled(isBusy || actions.isBusy)
        }
    }

    private func cardText(_ text: String) -> some View {
        Text(text)
            .frame(maxWidth: .infinity, minHeight: 80, alignment: .topLeading)
            .textSelection(.enabled)
    }

    private func delete() async {
        guard await actions.delete() else { return }

        onDeleted()
        dismiss()
    }

    private func toggle() async {
        guard !isBusy else { return }

        isBusy = true
        message = nil
        defer { isBusy = false }

        do {
            let result: ScheduleControlResult

            if isSuspended {
                result = try await APIClient.setSchedule(id: item.id, suspended: false, buried: nil)
            } else if isBuried {
                result = try await APIClient.setSchedule(id: item.id, suspended: nil, buried: false)
            } else {
                result = try await APIClient.setSchedule(id: item.id, suspended: true, buried: nil)
            }

            if result.suspended {
                state = "suspended"
            } else if result.buriedUntil != nil {
                state = "buried"
            } else {
                state = item.state == "suspended" || item.state == "buried" ? "active" : item.state
            }

            onStateChange(state)
        } catch {
            message = KnowledgeManageError.message(for: error, action: "update this item")
        }
    }
}

extension KnowledgeOverviewItem {
    static func label(for state: String) -> String {
        KnowledgeOverviewItem(
            knowledgeBitId: "", question: "", answer: "", subjectId: nil, state: state, dueAt: nil, lapses: 0
        ).stateLabel
    }
}
