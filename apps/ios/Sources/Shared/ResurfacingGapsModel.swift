import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class ResurfacingGapsModel {
    var userDeferred: [GapResurfaceItem] = []
    var dismissedCheckin: [GapResurfaceItem] = []
    var busyIds: Set<String> = []
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?

    var isEmpty: Bool {
        userDeferred.isEmpty && dismissedCheckin.isEmpty
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        failureKind = nil

        do {
            let due = try await APIClient.gapsDueForResurface()
            userDeferred = due.userDeferredDue
            dismissedCheckin = due.dismissedCheckinDue
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            isLoading = false

            return
        } catch {
            errorMessage = GapError.message(for: error)
            failureKind = ProgressLoadError.from(error) ?? .other
        }

        isLoading = false
    }

    func triage(_ item: GapResurfaceItem, action: GapTriageAction) async {
        guard !busyIds.contains(item.id) else { return }

        busyIds.insert(item.id)
        errorMessage = nil

        do {
            _ = try await APIClient.triageGap(id: item.id, action: action.rawValue)
            remove(item.id)
        } catch {
            if case APIError.badStatus(404, _) = error {
                remove(item.id)
            }

            errorMessage = GapError.message(for: error)
        }

        busyIds.remove(item.id)
    }

    private func remove(_ id: String) {
        userDeferred.removeAll { $0.id == id }
        dismissedCheckin.removeAll { $0.id == id }
    }
}
