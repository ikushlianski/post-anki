import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Request path encoding")
struct RequestPathEncodingTests {
    @Test("should encode path ids so they cannot add segments or query parameters")
    func encodesIds() {
        #expect(APIClient.encodedSegment("a/b?c=d#e f") == "a%2Fb%3Fc%3Dd%23e%20f")
        #expect(APIClient.encodedSegment("../x") == "..%2Fx")
    }

    @Test("should keep unreserved characters and encode non-ascii as utf-8")
    func keepsUnreserved() {
        #expect(APIClient.encodedSegment("Az09-._~") == "Az09-._~")
        #expect(APIClient.encodedSegment("é") == "%C3%A9")
    }

    @Test("should encode query values and separators in one place")
    func encodesQuery() {
        let path = APIClient.encodedPath("/x", query: [
            URLQueryItem(name: "q", value: "a&b=c+d"),
            URLQueryItem(name: "tz", value: "Europe/Minsk")
        ])

        #expect(path == "/x?q=a%26b%3Dc%2Bd&tz=Europe%2FMinsk")
        #expect(APIClient.encodedPath("/x") == "/x")
    }

    @Test("should encode ids in the request path of a real client call")
    func requestPathUsesEncoding() throws {
        let request = try APIClient.makeRequest("/curricula/\(APIClient.encodedSegment("a/b"))")

        #expect(request.url?.path(percentEncoded: true) == "/curricula/a%2Fb")
    }
}
