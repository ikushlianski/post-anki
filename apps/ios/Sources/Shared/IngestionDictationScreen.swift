import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class IngestionDictationScreenModel {
    let topic: Topic?
    let subjectId: String?
    var pieces: [AddKnowledgePiece] = [AddKnowledgePiece()]
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

    var showsSubjectPicker: Bool { subjectId == nil }
    var effectiveSubjectId: String? { subjectId ?? subjectPicker.selectedId }
    var showsTargetPhrases: Bool {
        TargetPhrases.isEnglish(subjectId: effectiveSubjectId, subjects: subjectPicker.subjects)
    }

    func loadSubjects() async {
        guard !showsSubjectPicker else { return }

        await subjectPicker.load()
    }

    var text: String {
        get { pieces[0].text }
        set { setText(newValue, for: pieces[0].id) }
    }

    var highlights: [KnowledgeHighlight] {
        get { pieces[0].highlights }
        set { pieces[0].highlights = newValue }
    }

    var targetPhrases: [String] {
        get { pieces[0].targetPhrases }
        set { pieces[0].targetPhrases = newValue }
    }

    var hasInput: Bool {
        isSubmitting || pieces.contains { !$0.isEmpty }
    }

    var canSubmit: Bool {
        !isSubmitting && pieces.contains { !$0.isEmpty }
    }

    func setText(_ newText: String, for id: UUID) {
        guard let index = pieces.firstIndex(where: { $0.id == id }) else { return }

        let old = pieces[index].text

        pieces[index].text = newText
        pieces[index].highlights = KnowledgeHighlights.shifted(from: old, to: newText, pieces[index].highlights)
        pieces[index].failure = nil
        pieces[index].canAddAnyway = false
        saveDraft()
    }

    func addPiece() {
        pieces.append(AddKnowledgePiece())
    }

    func removePiece(_ id: UUID) {
        pieces.removeAll { $0.id == id }

        if pieces.isEmpty { pieces = [AddKnowledgePiece()] }

        saveDraft()
    }

    private func saveDraft() {
        drafts.save(AddKnowledgePieceDraft.encode(pieces.map(\.text)), key: draftKey)
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
        let restored = AddKnowledgePieceDraft.decode(drafts.load(key: draftKey))

        pieces = restored.map { AddKnowledgePiece(text: $0) }
    }

    func submit() async {
        await send(pieces.filter { !$0.isEmpty }.map(\.id), force: false)
    }

    func addAnyway(pieceId: UUID? = nil) async {
        let ids = pieces.filter { $0.canAddAnyway && (pieceId == nil || $0.id == pieceId) }.map(\.id)

        await send(ids, force: true)
    }

    private func send(_ ids: [UUID], force: Bool) async {
        guard !isSubmitting, !ids.isEmpty else { return }

        isSubmitting = true
        errorMessage = nil
        canAddAnyway = false

        for id in ids {
            guard let index = pieces.firstIndex(where: { $0.id == id }) else { continue }

            pieces[index].failure = nil
            pieces[index].canAddAnyway = false
        }

        if activeDetections == 0 {
            hasSent = false
        }

        let sentSubjectId = effectiveSubjectId
        let sendsPhrases = showsTargetPhrases
        var lastCreatedId: String?
        var sentTexts: [UUID: String] = [:]

        for id in ids {
            guard let piece = pieces.first(where: { $0.id == id }), let content = AddKnowledgeInput.classify(piece.text) else { continue }

            do {
                let phrases = sendsPhrases ? TargetPhrases.cleaned(piece.targetPhrases) : []
                let sentHighlights = highlightsToSend(for: content, piece: piece)
                let created = try await APIClient.addKnowledgeSource(
                    content: content,
                    subjectId: sentSubjectId,
                    force: force,
                    targetPhrases: phrases.isEmpty ? nil : phrases,
                    highlights: sentHighlights.isEmpty ? nil : sentHighlights
                )

                lastCreatedId = created.id
                sentTexts[id] = piece.text
            } catch {
                markFailed(id, error)
            }
        }

        pieces.removeAll { sentTexts[$0.id] == $0.text }

        if pieces.isEmpty { pieces = [AddKnowledgePiece()] }

        saveDraft()
        reportFailures(ids: ids)

        guard let lastCreatedId else {
            isSubmitting = false

            return
        }

        summaryText = nil
        watchSummary(sourceId: lastCreatedId)
        hasSent = true
        isSubmitting = false
        activeDetections += 1
        defer { activeDetections -= 1 }
        try? await APIClient.detectKnowledgeBits()
    }

    private func reportFailures(ids: [UUID]) {
        let failedPositions = pieces.enumerated().filter { $0.element.failure != nil }.map(\.offset)

        if ids.count == 1, let failed = pieces.first(where: { $0.failure != nil }) {
            errorMessage = failed.failure
            canAddAnyway = failed.canAddAnyway
        } else if !failedPositions.isEmpty {
            errorMessage = AddKnowledgePieceDraft.failedMessage(positions: failedPositions)
            canAddAnyway = pieces.contains { $0.canAddAnyway }
        }
    }

    private func highlightsToSend(for content: KnowledgeSourceContent, piece: AddKnowledgePiece) -> [KnowledgeHighlight] {
        guard case .text = content else { return [] }

        return KnowledgeHighlights.trimmed(piece.highlights, for: piece.text)
    }

    private func markFailed(_ id: UUID, _ error: Error) {
        guard let index = pieces.firstIndex(where: { $0.id == id }) else { return }

        let reason = failure(for: error)

        pieces[index].failure = reason.message
        pieces[index].canAddAnyway = reason.canForce
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

    private func failure(for error: Error) -> (message: String, canForce: Bool) {
        if let refusal = KnowledgeSourceRefusal.from(error) {
            if refusal == .subjectNotFound, subjectId != nil {
                return ("That subject no longer exists. Go back and pick another.", refusal.canForce)
            }

            return (refusal.message, refusal.canForce)
        }

        return (AddSendFailure.message(for: error), false)
    }
}
