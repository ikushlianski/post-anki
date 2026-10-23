import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Redirect guard")
struct RedirectGuardTests {
    private func url(_ value: String) -> URL { URL(string: value)! }

    @Test("should follow a redirect that stays on the same https host")
    func allowsSameHost() {
        #expect(RedirectPolicy.allows(from: url("https://api.example.com/a"), to: url("https://API.example.com/b")))
    }

    @Test("should refuse a redirect to another host so the token is not sent there")
    func refusesOtherHost() {
        #expect(!RedirectPolicy.allows(from: url("https://api.example.com/a"), to: url("https://evil.example.net/a")))
    }

    @Test("should refuse a redirect from https to http")
    func refusesDowngrade() {
        #expect(!RedirectPolicy.allows(from: url("https://api.example.com/a"), to: url("http://api.example.com/a")))
    }

    @Test("should allow http to http on the same local host")
    func allowsLocalHttp() {
        #expect(RedirectPolicy.allows(from: url("http://localhost:3000/a"), to: url("http://localhost:3000/b")))
    }

    @Test("should cancel the redirect in the session delegate when the host changes")
    func delegateRefuses() throws {
        let session = URLSession(configuration: .ephemeral)
        let task = session.dataTask(with: URLRequest(url: url("https://api.example.com/a")))
        let response = try #require(HTTPURLResponse(url: url("https://api.example.com/a"), statusCode: 302, httpVersion: nil, headerFields: nil))
        var followed: URLRequest?? = .none

        RedirectGuard().urlSession(
            session,
            task: task,
            willPerformHTTPRedirection: response,
            newRequest: URLRequest(url: url("https://evil.example.net/a"))
        ) { followed = .some($0) }

        #expect(followed == .some(nil))
    }
}
