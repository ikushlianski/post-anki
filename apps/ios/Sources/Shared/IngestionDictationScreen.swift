import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class IngestionDictationScreenModel {
    let topic: Topic?
    let subjectId: String?
    var text = "" {
        didSet {
            drafts.save(text, key: draftKey)
            highlights = KnowledgeHighlights.shifted(from: oldValue, to: text, highlights)
        }
    }
    var highlights: [KnowledgeHighlight] = []
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

    let subjectPicker: AddKnowledgeSubjectPickerModel
    let fileImport = TextFileImportModel()
    var isPhrasesExpanded = false
    var canAddAnyway = false
    var targetPhrases: [String] = [""]
    private var lastSent: KnowledgeSourceContent?
    private var lastSentHighlights: [KnowledgeHighlight] = []

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

    init(
        topic: Topic?,
        subjectId: String?,
        drafts: AddDraftStoring = UserDefaultsAddDraftStore(),
        subjectPicker: AddKnowledgeSubjectPickerModel = AddKnowledgeSubjectPickerModel()
    ) {
        self.subjectPicker = subjectPicker
        self.topic = topic
        self.subjectId = subjectId
        self.drafts = drafts
        draftKey = UnsentDraftStore.key("add", subjectId ?? topic?.id)
        text = drafts.load(key: draftKey)
    }

    func submit() async {
        guard let content = AddKnowledgeInput.classify(text) else { return }

        await send(content, highlights: highlightsToSend(for: content), force: false)
    }

    func addAnyway() async {
        guard let content = lastSent else { return }

        await send(content, highlights: lastSentHighlights, force: true)
    }

    private func send(_ content: KnowledgeSourceContent, highlights sentHighlights: [KnowledgeHighlight], force: Bool) async {
        guard !isSubmitting else { return }

        isSubmitting = true
        errorMessage = nil
        canAddAnyway = false
        lastSent = content
        lastSentHighlights = sentHighlights

        if activeDetections == 0 {
            hasSent = false
        }

        do {
            let phrases = showsTargetPhrases ? TargetPhrases.cleaned(targetPhrases) : []
            let created = try await APIClient.addKnowledgeSource(
                content: content,
                subjectId: effectiveSubjectId,
                force: force,
                targetPhrases: phrases.isEmpty ? nil : phrases,
                highlights: sentHighlights.isEmpty ? nil : sentHighlights
            )

            summaryText = nil
            watchSummary(sourceId: created.id)
            text = ""
            highlights = []
            targetPhrases = [""]
            drafts.clear(key: draftKey)
            lastSent = nil
            lastSentHighlights = []
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

    private func highlightsToSend(for content: KnowledgeSourceContent) -> [KnowledgeHighlight] {
        guard case .text = content else { return [] }

        return KnowledgeHighlights.trimmed(highlights, for: text)
    }

    func stopWatching() {
        fileImport.stopWatching()
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
