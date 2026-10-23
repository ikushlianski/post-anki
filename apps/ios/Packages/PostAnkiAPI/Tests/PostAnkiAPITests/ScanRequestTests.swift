import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Scan requests")
struct ScanRequestTests {
    @Test("should give admin scans a timeout longer than the 60 second default so a long AI scan is not reported as failed")
    func scanTimeoutIsLong() throws {
        let request = try APIClient.makeRequest("/admin/scan", method: "POST", timeout: APIClient.scanTimeout)

        #expect(request.timeoutInterval == 300)
        #expect(request.timeoutInterval > 60)
    }

    @Test("should keep the default timeout for ordinary requests")
    func defaultTimeoutKept() throws {
        let request = try APIClient.makeRequest("/subjects")

        #expect(request.timeoutInterval == URLRequest(url: try #require(request.url)).timeoutInterval)
    }
}
