import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class IngestionDictationScreenModel {
    let topic: Topic?
    let subjectId: String?
    var text = "" {
        didSet { drafts.save(text, key: draftKey) }
    }
    var isSubmitting = false
    var activeDetections = 0
    var isDetecting: Bool { activeDetections > 0 }
    var errorMessage: String?
    var hasSent = false
    var showReview = false
    var summaryText: String?

    private var summaryTask: Task<Void, Never>?
    private var trackedSourceId: String?
    private let summaryPollInterval: Duration = .seconds(3)
    private let summaryMaxPolls = 40

    let subjectPicker = AddKnowledgeSubjectPickerModel()
    var canAddAnyway = false
    var targetPhrases: [String] = [""]
    private var lastSent: KnowledgeSourceContent?

    var showsSubjectPicker: Bool { subjectId == nil }
    var effectiveSubjectId: String? { subjectId ?? subjectPicker.selectedId }
    var showsTargetPhrases: Bool {
        TargetPhrases.isEnglish(subjectId: effectiveSubjectId, subjects: subjectPicker.subjects)
    }

    func loadSubjects() async {
        guard !showsSubjectPicker else { return }

        await subjectPicker.load()
    }

    var hasInput: Bool {
        isSubmitting || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private let drafts: AddDraftStoring
    private let draftKey: String

    init(topic: Topic?, subjectId: String?, drafts: AddDraftStoring = UserDefaultsAddDraftStore()) {
        self.topic = topic
        self.subjectId = subjectId
        self.drafts = drafts
        draftKey = UnsentDraftStore.key("add", subjectId ?? topic?.id)
        text = drafts.load(key: draftKey)
    }

    func submit() async {
        guard let content = AddKnowledgeInput.classify(text) else { return }

        await send(content, force: false)
    }

    func addAnyway() async {
        guard let content = lastSent else { return }

        await send(content, force: true)
    }

    private func send(_ content: KnowledgeSourceContent, force: Bool) async {
        guard !isSubmitting else { return }

        isSubmitting = true
        errorMessage = nil
        canAddAnyway = false
        lastSent = content

        if activeDetections == 0 {
            hasSent = false
        }

        do {
            let phrases = showsTargetPhrases ? TargetPhrases.cleaned(targetPhrases) : []
            let created = try await APIClient.addKnowledgeSource(
                content: content,
                subjectId: effectiveSubjectId,
                force: force,
                targetPhrases: phrases.isEmpty ? nil : phrases
            )

            summaryText = nil
            watchSummary(sourceId: created.id)
            text = ""
            targetPhrases = [""]
            drafts.clear(key: draftKey)
            lastSent = nil
            hasSent = true
            isSubmitting = false
            activeDetections += 1
            defer { activeDetections -= 1 }
            try? await APIClient.detectKnowledgeBits()
        } catch {
            isSubmitting = false
            present(error)
        }
    }

    func stopWatching() {
        summaryTask?.cancel()
        summaryTask = nil
        trackedSourceId = nil
    }

    private func watchSummary(sourceId: String?) {
        stopWatching()

        guard let sourceId else { return }

        trackedSourceId = sourceId

        summaryTask = Task { [weak self] in
            guard let self else { return }

            for _ in 0..<summaryMaxPolls {
                try? await Task.sleep(for: summaryPollInterval)

                guard !Task.isCancelled else { return }

                let status = try? await APIClient.knowledgeSourceRegeneration(id: sourceId)

                guard ExtractionSummaryGuard.shouldApply(
                    trackedSourceId: trackedSourceId,
                    resultSourceId: sourceId,
                    isCancelled: Task.isCancelled
                ) else { return }

                if let status, status.isFinished {
                    summaryText = status.summaryText

                    return
                }
            }
        }
    }

    private func present(_ error: Error) {
        if let refusal = KnowledgeSourceRefusal.from(error) {
            if refusal == .subjectNotFound, subjectId != nil {
                errorMessage = "That subject no longer exists. Go back and pick another."
            } else {
                errorMessage = refusal.message
            }

            canAddAnyway = refusal.canForce

            return
        }

        errorMessage = AddSendFailure.message(for: error)
    }
}

struct IngestionDictationScreen: View {
    @State private var model: IngestionDictationScreenModel

    init(topic: Topic? = nil, subjectId: String? = nil) {
        _model = State(initialValue: IngestionDictationScreenModel(topic: topic, subjectId: subjectId))
    }

    private var submitTile: MainActionTile {
        #if os(macOS)
        let shortcut: KeyboardShortcut? = KeyboardShortcut(.return, modifiers: .command)
        #else
        let shortcut: KeyboardShortcut? = nil
        #endif

        return MainActionTile(
            title: "Submit",
            style: .prominent,
            isLoading: model.isSubmitting,
            isDisabled: model.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            shortcut: shortcut
        ) { Task { await model.submit() } }
    }

    var body: some View {
        Form {
            if let topic = model.topic {
                Section {
                    Text("Topic: \(topic.title)")
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if model.showsSubjectPicker {
                AddKnowledgeSubjectPicker(model: model.subjectPicker)
            }

            if model.showsTargetPhrases {
                TargetPhrasesSection(phrases: $model.targetPhrases)
            }

            Section("Dictate what you're learning") {
                TextEditor(text: $model.text)
                    .frame(minHeight: 200)
                    .overlay(alignment: .topLeading) {
                        if model.text.isEmpty {
                            Text(AddKnowledgeInput.placeholder)
                                .foregroundStyle(.secondary)
                                .padding(.top, 8)
                                .padding(.leading, 5)
                                .allowsHitTesting(false)
                                .accessibilityHidden(true)
                        }
                    }

                #if os(iOS)
                PasteButton(payloadType: String.self) { strings in
                    guard let pasted = strings.first else { return }

                    Task { @MainActor in model.text = AddKnowledgeDraft.pasting(pasted, into: model.text) }
                }
                .accessibilityIdentifier("add-knowledge-paste")
                #endif
            }

            if model.hasSent {
                Section {
                    Text(model.isDetecting
                        ? "Sent. Extracting items..."
                        : "Added. Questions take a minute or two to appear. Approve them on the next screen to add them to your review queue.")
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                    if let summaryText = model.summaryText {
                        Text(summaryText)
                            .zoomFont(.caption)
                    }

                    Button("Review new items") { model.showReview = true }
                        .disabled(model.isDetecting)
                }
            }

            if let errorMessage = model.errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)

                    if model.canAddAnyway {
                        Button("Add anyway") {
                            Task { await model.addAnyway() }
                        }
                        .disabled(model.isSubmitting)
                    }
                }
            }
        }
        .refreshable { if model.showsSubjectPicker { await model.subjectPicker.load() } }
        .keyboardDismissal()
        .task { await model.loadSubjects() }
        .onDisappear { model.stopWatching() }
        .navigationTitle("Add Knowledge")
        .mainActionControls([submitTile])
        .reportsUnsentInput("add-knowledge", model.hasInput)
        .sheet(isPresented: $model.showReview) {
            PendingReviewScreen(onDone: { model.showReview = false })
                #if os(iOS)
                .presentationDragIndicator(.visible)
                #else
                .frame(minWidth: 480, minHeight: 520)
                #endif
        }
    }
}
