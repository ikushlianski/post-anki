import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class DecideModel {
    var decision = ""
    var opinion = ""
    var session: DecideSession?
    var isSubmitting = false
    var errorMessage: String?
    var resolving: Set<String> = []
    var spotMessage: String?

    var hasInput: Bool {
        isSubmitting
            || !decision.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !opinion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var canSubmit: Bool {
        !isSubmitting
            && !decision.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !opinion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func submit() async {
        guard canSubmit else { return }

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            session = try await APIClient.createDecideSession(
                decision: decision.trimmingCharacters(in: .whitespacesAndNewlines),
                opinion: opinion.trimmingCharacters(in: .whitespacesAndNewlines)
            )
        } catch {
            errorMessage = DecideError.message(for: error)
        }
    }

    func reset() {
        decision = ""
        opinion = ""
        session = nil
        errorMessage = nil
        spotMessage = nil
    }

    func resolve(spotId: String, accepted: Bool) async {
        guard !resolving.contains(spotId) else { return }

        resolving.insert(spotId)
        spotMessage = nil
        defer { resolving.remove(spotId) }

        do {
            let updated = try await APIClient.resolveBlindSpot(id: spotId, accepted: accepted)

            guard var current = session,
                  let index = current.blindSpots.firstIndex(where: { $0.id == spotId }) else { return }

            current.blindSpots[index] = updated
            session = current
        } catch {
            spotMessage = DecideError.message(for: error)
        }
    }
}

@Observable
@MainActor
final class DecideHistoryModel {
    var sessions: [DecideSession] = []
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        failureKind = nil
        defer { isLoading = false }

        do {
            sessions = try await APIClient.listDecideSessions()
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = DecideError.message(for: error)
            failureKind = ProgressLoadError.from(error)
        }
    }
}
