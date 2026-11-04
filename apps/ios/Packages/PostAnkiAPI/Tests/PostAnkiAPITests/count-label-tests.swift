import Testing
@testable import PostAnkiAPI

@Suite("Count labels")
struct CountLabelTests {
    @Test("should use the singular for exactly one and the plural for zero and many", arguments: [(0, "0 cards"), (1, "1 card"), (2, "2 cards")])
    func pluralises(count: Int, expected: String) {
        #expect(CountLabel.text(count, "card") == expected)
    }

    @Test("should use a custom plural when one is given")
    func customPlural() {
        #expect(CountLabel.text(1, "query", plural: "queries") == "1 query")
        #expect(CountLabel.text(3, "query", plural: "queries") == "3 queries")
    }
}
