import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Web links from server or AI content")
struct WebLinkTests {
    @Test("should open http and https links")
    func allowsWebSchemes() {
        #expect(WebLink.url(from: "https://example.com/a?b=1") != nil)
        #expect(WebLink.url(from: "HTTP://example.com") != nil)
    }

    @Test("should refuse links that would launch other apps or read local files")
    func refusesOtherSchemes() {
        for raw in ["javascript:alert(1)", "file:///etc/passwd", "tel:123", "mailto:a@b.c", "x-apple.systempreferences:", "example.com", "https://", ""] {
            #expect(WebLink.url(from: raw) == nil, "\(raw)")
        }
    }

    @Test("should strip non-web links from markdown but keep the visible text and web links")
    func markdownLinksAreFiltered() {
        let text = LectureMarkdown.text("[bad](javascript:alert(1)) and [good](https://example.com)")
        let links = text.runs.compactMap(\.link)

        #expect(links.map(\.absoluteString) == ["https://example.com"])
        #expect(String(text.characters) == "bad and good")
    }
}
