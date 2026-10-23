import Foundation
import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class AdminModel {
    var settings: AdminSettings?
    var observability: AdminObservability?
    var feedback: [AdminModelFeedback] = []
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?
    var forbiddenDetail: String?

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        failureKind = nil
        forbiddenDetail = nil
        defer { isLoading = false }

        do {
            async let fetchedSettings = APIClient.adminSettings()
            async let fetchedObservability = APIClient.adminObservability()
            async let fetchedFeedback = APIClient.adminFeedbackByModel()

            settings = try await fetchedSettings
            observability = try await fetchedObservability
            feedback = try await fetchedFeedback
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = StudyToolsError.message(for: error)
            failureKind = ProgressLoadError.from(error)
            forbiddenDetail = AdminForbidden.detail(for: error)
        }
    }
}

@Observable
@MainActor
final class AdminScansModel {
    var running: Set<String> = []
    var results: [String: String] = [:]
    var refusals: [String: String] = [:]

    func run(_ scan: AdminScan) async {
        guard !running.contains(scan.id) else { return }

        running.insert(scan.id)
        results[scan.id] = nil
        refusals[scan.id] = nil
        defer { running.remove(scan.id) }

        do {
            let summary = try await APIClient.adminRunScan(path: scan.path)

            results[scan.id] = "Done: \(summary.text)"
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            results[scan.id] = AdminScanError.message(for: error)
            refusals[scan.id] = AdminForbidden.detail(for: error)
        }
    }
}

enum AdminScanError {
    static func message(for error: Error) -> String {
        if let urlError = error as? URLError, urlError.code == .timedOut {
            return "Scan timed out. It may still be running on the server; check before running it again."
        }

        switch ProgressLoadError.from(error) {
        case .unauthorized: return "Scan failed. Add your access token in Settings."
        case .offline: return "Scan failed. You're offline; the scan may or may not have started."
        default: return "Scan failed."
        }
    }
}

enum AdminForbidden {
    static func detail(for error: Error) -> String? {
        guard case APIError.badStatus(403, let code) = error else { return nil }

        return "The server refused this request: \(code ?? "forbidden")."
    }
}
