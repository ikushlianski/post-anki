import Testing
@testable import PostAnkiAPI

@Suite("Next-interval labels shown under review grade buttons")
struct IntervalFormatTests {
    @Test("should label the server previews as 1m, 6m, 10m and 4d")
    func shortLabels() {
        #expect(IntervalFormat.short(seconds: 60) == "1m")
        #expect(IntervalFormat.short(seconds: 360) == "6m")
        #expect(IntervalFormat.short(seconds: 600) == "10m")
        #expect(IntervalFormat.short(seconds: 345_600) == "4d")
    }

    @Test("should label hours and months for longer gaps")
    func longLabels() {
        #expect(IntervalFormat.short(seconds: 7200) == "2h")
        #expect(IntervalFormat.short(seconds: 86_400 * 45) == "1.5mo")
    }
}
