import Testing
@testable import PostAnkiAPI

@Suite("Chat snooze options")
struct ChatQueueSnoozeOptionsTests {
    @Test("should offer the same 1, 3, 7 and 14 day choices in the list and the thread")
    func offersDays() {
        #expect(ChatQueueSnoozeOptions.days == [1, 3, 7, 14])
    }

    @Test("should word one day in singular and the rest in plural")
    func labels() {
        #expect(ChatQueueSnoozeOptions.days.map(ChatQueueSnoozeOptions.label(days:)) == ["1 day", "3 days", "7 days", "14 days"])
    }
}
