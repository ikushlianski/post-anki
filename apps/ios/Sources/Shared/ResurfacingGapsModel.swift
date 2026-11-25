import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class ResurfacingGapsModel {
    var userDeferred: [GapResurfaceItem] = []
    var dismissedCheckin: [GapResurfaceItem] = []
    var busyIds: Set<String> = []
    let writes = SerialWriteQueue()
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

    func settle() async { await writes.settle() }

    func triage(_ item: GapResurfaceItem, action: GapTriageAction) async {
        guard !busyIds.contains(item.id) else { return }

        let deferredIndex = userDeferred.firstIndex { $0.id == item.id }
        let checkinIndex = dismissedCheckin.firstIndex { $0.id == item.id }

        busyIds.insert(item.id)
        errorMessage = nil
        remove(item.id)

        writes.enqueue { [self] in
            defer { busyIds.remove(item.id) }

            do {
                _ = try await APIClient.triageGap(id: item.id, action: action.rawValue)
            } catch {
                if case APIError.badStatus(404, _) = error {
                    errorMessage = GapError.message(for: error)

                    return
                }

                if let deferredIndex { userDeferred.insert(item, at: min(deferredIndex, userDeferred.count)) }

                if let checkinIndex { dismissedCheckin.insert(item, at: min(checkinIndex, dismissedCheckin.count)) }

                errorMessage = GapError.message(for: error)
            }
        }
    }

    private func remove(_ id: String) {
        userDeferred.removeAll { $0.id == id }
        dismissedCheckin.removeAll { $0.id == id }
    }
}
