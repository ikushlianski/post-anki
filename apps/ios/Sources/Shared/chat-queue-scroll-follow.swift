enum ChatQueueScrollFollow {
    static func shouldScroll(isAtBottom: Bool, newestIsUser: Bool) -> Bool {
        isAtBottom || newestIsUser
    }

    static func showsJumpButton(isAtBottom: Bool, hasLines: Bool) -> Bool {
        hasLines && !isAtBottom
    }
}
