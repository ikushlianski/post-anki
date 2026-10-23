import Foundation

extension APIClient {
    public static func listPendingReview() async throws -> [PendingReviewSource] {
        try await request("/knowledge-bits/pending-review")
    }

    public static func approveKnowledgeBit(id: String) async throws {
        let _: EmptyResponse = try await request("/knowledge-bits/\(encodedSegment(id))/approve", method: "POST")
    }

    public static func rejectKnowledgeBit(id: String) async throws -> String? {
        let result: RejectKnowledgeBitResult = try await request("/knowledge-bits/\(encodedSegment(id))/reject", method: "POST")

        return result.feedbackId
    }

    public static func approveKnowledgeBits(ids: [String]) async throws -> PendingReviewBulkApprovalResult {
        try await request(
            "/knowledge-bits/approvals",
            method: "POST",
            body: PendingReviewBulkApprovalInput(knowledgeBitIds: ids)
        )
    }

    public static func restoreKnowledgeBit(id: String) async throws {
        let _: EmptyResponse = try await request("/knowledge-bits/\(encodedSegment(id))/restore", method: "POST")
    }

    public static func pendingReviewCount() async throws -> Int {
        let response: PendingReviewCountResponse = try await request("/knowledge-bits/pending-review/count")

        return response.count
    }
}
