import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class PracticeModel {
    static let chunkSize = 5

    let subject: PracticeSubject
    var settings: PracticeSettings?
    var phrases: [Phrase] = []
    var chunkIndex = 0
    var answers: [String: String] = [:]
    var results: [String: PhraseAttempt] = [:]
    var masteredPhrases: [String] = []
    var isLoadingBatch = false
    var isSubmitting = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?
    var pendingChange: PracticeSettingsInput?

    init(subject: PracticeSubject) {
        self.subject = subject
    }

    var chunk: [Phrase] {
        let start = chunkIndex * Self.chunkSize

        guard start < phrases.count else { return [] }

        return Array(phrases[start..<min(start + Self.chunkSize, phrases.count)])
    }

    var chunkGraded: Bool { !chunk.isEmpty && chunk.allSatisfy { results[$0.id] != nil } }

    var canSubmit: Bool {
        !isSubmitting && !chunkGraded && chunk.allSatisfy {
            !(answers[$0.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    var hasMoreChunks: Bool { (chunkIndex + 1) * Self.chunkSize < phrases.count }

    var hasUnsentAnswers: Bool {
        chunk.contains { results[$0.id] == nil && !(answers[$0.id] ?? "").isEmpty }
    }

    func start() async {
        guard settings == nil || phrases.isEmpty else { return }

        if settings == nil { await loadSettings() }

        if settings != nil, errorMessage == nil, phrases.isEmpty { await nextBatch() }
    }

    func loadSettings() async {
        errorMessage = nil
        failureKind = nil

        do {
            settings = try await APIClient.practiceSettings(subjectId: subject.id)
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = PracticeError.message(for: error)
            failureKind = ProgressLoadError.from(error)
        }
    }

    func nextBatch() async {
        guard !isLoadingBatch else { return }

        isLoadingBatch = true
        errorMessage = nil
        failureKind = nil
        defer { isLoadingBatch = false }

        do {
            let fresh = try await APIClient.createPhraseBatch(subjectId: subject.id)

            phrases = fresh
            chunkIndex = 0
            answers = [:]
            results = [:]
            masteredPhrases = []
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = PracticeError.message(for: error)
            failureKind = ProgressLoadError.from(error)
        }
    }

    func requestChange(level: String?, pack: String?) {
        let input = PracticeSettingsInput(level: level, pack: pack)

        if hasUnsentAnswers {
            pendingChange = input
        } else {
            Task { await apply(input) }
        }
    }

    func apply(_ input: PracticeSettingsInput) async {
        pendingChange = nil

        do {
            settings = try await APIClient.updatePracticeSettings(
                subjectId: subject.id,
                level: input.level,
                pack: input.pack
            )
        } catch {
            errorMessage = PracticeError.message(for: error)

            return
        }

        await nextBatch()
    }

    func submit() async {
        guard canSubmit else { return }

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        let sent = chunk.map {
            PhraseAnswerInput(
                phraseId: $0.id,
                userAnswer: (answers[$0.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            )
        }

        do {
            let result = try await APIClient.submitPhraseAttempts(subjectId: subject.id, answers: sent)

            for attempt in result.attempts { results[attempt.phraseId] = attempt }

            masteredPhrases += result.phraseBankUpdates.filter { $0.status == "mastered" }.map(\.phraseText)
        } catch {
            errorMessage = PracticeError.message(for: error)
        }
    }

    func advance() async {
        if hasMoreChunks {
            chunkIndex += 1
            masteredPhrases = []
        } else {
            await nextBatch()
        }
    }
}
