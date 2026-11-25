import PostAnkiAPI
import SwiftUI

struct KnowledgeItemDetailScreen: View {
    let item: KnowledgeOverviewItem
    let subjectName: String?
    let onStateChange: (String) -> Void
    let onDeleted: () -> Void
    let onMoved: (String) -> Void

    @State private var actions: KnowledgeItemActionsModel
    @State private var variants: MoreVariantsModel
    @State private var cards: KnowledgeItemCardsModel
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

        let actionsModel = KnowledgeItemActionsModel(item: item)
        let cardsModel = KnowledgeItemCardsModel(bitId: item.id)

        actionsModel.onMoved = onMoved
        actionsModel.onStateChange = { state in
            onStateChange(state)
            Task { await cardsModel.load() }
        }

        _actions = State(initialValue: actionsModel)
        _variants = State(initialValue: MoreVariantsModel(bitId: item.id))
        _cards = State(initialValue: cardsModel)
    }

    private var shownSubjectName: String? { actions.subjectName ?? subjectName }

    private var actionTitle: String {
        if actions.isSuspended { return "Unsuspend" }

        return actions.isBuried ? "Bring back today" : "Suspend"
    }

    var body: some View {
        GeometryReader { proxy in
            List {
                Section("Question") { cardText(CardKind.hideBlanks(actions.question)) }
                Section("Answer") { cardText(actions.answer) }

                SynonymsSection(bitId: item.id, question: actions.question)

                Section {
                    LabeledContent("Status", value: KnowledgeOverviewItem.label(for: actions.state))

                    if let shownSubjectName { LabeledContent("Subject", value: shownSubjectName) }

                    if let due = item.dueAt.flatMap({ DueReviewModel.nextDueText($0) }) {
                        LabeledContent("Due", value: due)
                    }

                    if item.lapses > 0 { LabeledContent("Lapses", value: String(item.lapses)) }
                }

                KnowledgeItemCardsSection(model: cards)

                if let message = actions.message {
                    Section { Text(message).zoomFont(.caption).foregroundStyle(.red) }
                }

                MoreVariantsSection(model: variants)
            }
            .frame(width: KnowledgeItemDetailLayout.contentWidth(available: proxy.size.width))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .navigationTitle("Item")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar { toolbar }
        .sheet(isPresented: $editing) {
            if let source = actions.noteSource {
                NoteEditSheet(
                    kind: source.kind,
                    text: source.text,
                    onSave: { text in await actions.editNote(text) },
                    onClose: { editing = false }
                )
            } else {
                QuestionVariantEditSheet(context: actions.context, prompt: actions.question, answer: actions.answer) { context, prompt, answer in
                    await actions.edit(context: context, prompt: prompt, answer: answer)
                }
            }
        }
        .sheet(isPresented: $choosingSubject) {
            KnowledgeMoveSheet(
                subjects: actions.subjects,
                excludedId: actions.subjectId,
                loadFailureMessage: actions.subjectsNotice,
                onRetry: { Task { await actions.loadSubjects() } }
            ) { subject in
                Task { _ = await actions.move(to: subject) }
            }
        }
        .confirmationDialog("Delete this item? This can't be undone.", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await delete() } }
            Button("Cancel", role: .cancel) {}
        }
        .task { await actions.loadSubjects() }
        .task { await actions.loadContext() }
        .task { await cards.load() }
        .refreshable {
            await actions.refreshFromServer()
            await cards.load()
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            Menu {
                Button("Edit", systemImage: "pencil") {
                    Task {
                        if await actions.prepareEdit() { editing = true }
                    }
                }
                Button("Move to subject", systemImage: "folder") { choosingSubject = true }
                Button(actionTitle, systemImage: actions.isSuspended ? "play.circle" : "pause.circle") {
                    Task { await actions.toggleSuspend() }
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
            .disabled(actions.isBusy)
        }
    }

    private func cardText(_ text: String) -> some View {
        CardRichText(text: text) {
            Text(text)
        }
        .frame(maxWidth: .infinity, minHeight: 80, alignment: .topLeading)
        .textSelection(.enabled)
    }

    private func delete() async {
        guard await actions.delete() else { return }

        onDeleted()
        dismiss()
    }
}

extension KnowledgeOverviewItem {
    static func label(for state: String) -> String {
        KnowledgeOverviewItem(
            knowledgeBitId: "", question: "", answer: "", subjectId: nil, state: state, dueAt: nil, lapses: 0
        ).stateLabel
    }
}
