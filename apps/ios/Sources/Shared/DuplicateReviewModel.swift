import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class DuplicateReviewModel {
    var subjectPairs: [SubjectDuplicateSuggestion] = []
    var sourcePairs: [SourceDuplicateSuggestion] = []
    var subjectNames: [String: String] = [:]
    var sourceNames: [String: String] = [:]
    var isLoading = false
    var hasLoaded = false
    var isScanning = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?
    var notice: String?

    func subjectName(_ id: String) -> String { subjectNames[id] ?? "(removed)" }

    func sourceName(_ id: String) -> String { sourceNames[id] ?? "(removed)" }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        failureKind = nil
        defer { isLoading = false }

        do {
            async let subjects = APIClient.listSubjects()
            async let sources = APIClient.duplicateReviewSources()
            async let pendingSubjects = APIClient.subjectDuplicateSuggestions()
            async let pendingSources = APIClient.sourceDuplicateSuggestions()

            subjectNames = Dictionary(try await subjects.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
            sourceNames = Dictionary(try await sources.map { ($0.id, $0.displayName) }, uniquingKeysWith: { first, _ in first })
            subjectPairs = try await pendingSubjects
            sourcePairs = try await pendingSources
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = DuplicateReviewError.message(for: error)
            failureKind = ProgressLoadError.from(error)
        }
    }

    func scanSubjects() async {
        await scan {
            let result = try await APIClient.scanSubjectDuplicates()

            return "Found \(result.suggestions.count) possible duplicates."
        }
    }

    func scanSources() async {
        await scan {
            try await APIClient.scanSourceDuplicates()

            return "Scan finished."
        }
    }

    func resolveSubject(_ pair: SubjectDuplicateSuggestion, keep: String?) async {
        await resolve { try await APIClient.resolveSubjectDuplicate(id: pair.id, keepSubjectId: keep) }
    }

    func resolveSource(_ pair: SourceDuplicateSuggestion, acknowledged: Bool) async {
        await resolve { try await APIClient.resolveSourceDuplicate(id: pair.id, acknowledged: acknowledged) }
    }

    private func scan(_ run: () async throws -> String) async {
        notice = nil
        isScanning = true
        defer { isScanning = false }

        do {
            notice = try await run()
        } catch {
            notice = DuplicateReviewError.message(for: error)
        }

        await load()
    }

    private func resolve(_ call: () async throws -> Void) async {
        notice = nil

        do {
            try await call()
        } catch {
            notice = DuplicateReviewError.message(for: error)
        }

        await load()
    }
}
