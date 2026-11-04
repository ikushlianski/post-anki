import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class KnowledgeMeaningSearchModel {
    var isOn = false
    var matches: KnowledgeMeaningMatches?
    var isLoading = false
    var failure: String?

    @ObservationIgnored private var requestToken = 0

    func search(
        text: String,
        subjectId: String?,
        states: [String] = [],
        origins: [String] = []
    ) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)

        guard isOn, !trimmed.isEmpty else {
            clear()

            return
        }

        requestToken += 1

        let token = requestToken

        isLoading = true
        failure = nil
        defer { if token == requestToken { isLoading = false } }

        do {
            let result = try await APIClient.knowledgeMeaningMatches(
                q: trimmed,
                subjectId: subjectId,
                states: states,
                origins: origins
            )

            guard token == requestToken else { return }

            matches = result
        } catch {
            guard token == requestToken, !KnowledgeManageError.isCancellation(error) else { return }

            matches = nil
            failure = KnowledgeMeaningSearchError.message(for: error)
        }
    }

    func clear() {
        requestToken += 1
        matches = nil
        failure = nil
        isLoading = false
    }
}
