import Foundation

extension APIClient {
    public static let scanTimeout: TimeInterval = 300

    public static func adminSettings() async throws -> AdminSettings {
        try await request("/admin/settings")
    }

    public static func adminObservability() async throws -> AdminObservability {
        try await request("/admin/observability")
    }

    public static func adminFeedbackByModel() async throws -> [AdminModelFeedback] {
        let result: AdminFeedbackByModel = try await request("/admin/knowledge-bit-feedback/by-model")

        return result.models
    }

    public static func adminRunScan(path: String) async throws -> AdminScanSummary {
        try await request(path, method: "POST", timeout: scanTimeout)
    }
}
