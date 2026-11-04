import Testing
@testable import PostAnkiAPI

@Suite("Triage accessibility announcements and haptics")
struct TriageFeedbackTests {
    @Test("should tell a VoiceOver user the card was restored")
    func restored() {
        #expect(TriageAnnouncement.restored.message == "Card restored")
    }

    @Test("should name the snooze length in singular and plural")
    func snoozed() {
        #expect(TriageAnnouncement.snoozed(days: 1).message == "Snoozed for 1 day")
        #expect(TriageAnnouncement.snoozed(days: 7).message == "Snoozed for 7 days")
    }

    @Test("should announce Chat and Inbox moves")
    func moves() {
        #expect(TriageAnnouncement.sentToChat.message == "Sent to Chat")
        #expect(TriageAnnouncement.movedToInbox.message == "Moved to Inbox")
    }

    @Test("should give each triage swipe decision its own haptic")
    func haptics() {
        #expect(TriageHapticKind.kind(for: .accept) == .success)
        #expect(TriageHapticKind.kind(for: .reject) == .warning)
        #expect(TriageHapticKind.kind(for: .chat) == .lightImpact)
        #expect(TriageHapticKind.kind(for: .inbox) == .rigidImpact)
    }
}
