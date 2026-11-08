import Testing

@Suite("Chat thread scroll follow")
struct ChatQueueScrollFollowSmokeTests {
    @Test("should stay put when the reader scrolled up and the tutor replies")
    func staysPut() {
        #expect(!ChatQueueScrollFollow.shouldScroll(isAtBottom: false, newestIsUser: false))
    }

    @Test("should follow new replies when the reader is at the bottom")
    func follows() {
        #expect(ChatQueueScrollFollow.shouldScroll(isAtBottom: true, newestIsUser: false))
    }

    @Test("should always reveal the message the reader just sent")
    func revealsOwn() {
        #expect(ChatQueueScrollFollow.shouldScroll(isAtBottom: false, newestIsUser: true))
    }

    @Test("should show the jump button only when scrolled away from the newest message")
    func jumpButton() {
        #expect(ChatQueueScrollFollow.showsJumpButton(isAtBottom: false, hasLines: true))
        #expect(!ChatQueueScrollFollow.showsJumpButton(isAtBottom: true, hasLines: true))
        #expect(!ChatQueueScrollFollow.showsJumpButton(isAtBottom: false, hasLines: false))
    }
}
