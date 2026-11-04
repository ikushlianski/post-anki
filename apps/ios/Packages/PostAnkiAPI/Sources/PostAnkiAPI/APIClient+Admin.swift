import Foundation

extension APIClient {
    public static let scanTimeout: TimeInterval = 300

    public static func adminSettings() async throws -> AdminSettings {
        try await request("/admin/settings")
    }

    public static func updateAdminSettings(_ update: AdminSettingsUpdate) async throws -> AdminSettings {
        let req = try makeRequest("/admin/settings", method: "PATCH", body: update)
        let (data, response) = try await session.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0

        if status == 401 { throw APIError.unauthorized }

        guard (200..<300).contains(status) else {
            if status == 400, let refusal = AdminSettingsRefusal.decode(from: data) { throw refusal }

            throw APIError.badStatus(status, try? JSONDecoder().decode(APIErrorBody.self, from: data).error)
        }

        return try JSONDecoder().decode(AdminSettings.self, from: data)
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
