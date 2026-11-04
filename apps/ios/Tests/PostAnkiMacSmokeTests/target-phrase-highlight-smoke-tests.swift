import Foundation
import Testing

extension SmokeTests {
    @Suite("Target phrase is underlined inside the answer sentence")
    struct TargetPhraseHighlightSmokeTests {
        private func underlined(_ text: AttributedString) -> String {
            text.runs.filter { $0.underlineStyle != nil }.map { String(text[$0.range].characters) }.joined()
        }

        @Test("should underline the phrase where it appears in the sentence")
        func underlinesFoundPhrase() {
            let result = TargetPhraseHighlight.attributed("I ran out of time today", phrase: "ran out of")

            #expect(underlined(result) == "ran out of")
            #expect(String(result.characters) == "I ran out of time today")
        }

        @Test("should leave the sentence plain when the phrase is missing")
        func leavesPlainWhenNotFound() {
            let result = TargetPhraseHighlight.attributed("I ran out of time", phrase: "give up")

            #expect(underlined(result).isEmpty)
            #expect(String(result.characters) == "I ran out of time")
        }

        @Test("should match the phrase regardless of letter case or accents")
        func ignoresCaseAndDiacritics() {
            #expect(underlined(TargetPhraseHighlight.attributed("Ran Out of time", phrase: "ran out of")) == "Ran Out of")
            #expect(underlined(TargetPhraseHighlight.attributed("Un café noir", phrase: "CAFE")) == "café")
        }

        @Test("should not underline anything when the phrase is empty")
        func emptyPhrase() {
            #expect(underlined(TargetPhraseHighlight.attributed("Some sentence", phrase: "")).isEmpty)
            #expect(underlined(TargetPhraseHighlight.attributed("Some sentence", phrase: "  ")).isEmpty)
        }
    }
}
