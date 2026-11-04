import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Phrase situation variants in triage")
    struct PhraseSituationVariantsSmokeTests {
        private func variants(prompts: [String]) throws -> [PendingReviewVariant] {
            let items = prompts.enumerated().map {
                #"{"id":"v\#($0.offset + 1)","kind":"basic","prompt":"\#($0.element)","answer":"Sentence \#($0.offset + 1)"}"#
            }

            return try JSONDecoder().decode([PendingReviewVariant].self, from: Data("[\(items.joined(separator: ","))]".utf8))
        }

        @Test("should show the highlighted option's own question and answer when the questions differ")
        func frontFollowsSelection() throws {
            var selection = PendingReviewTriageSelection(variants: try variants(prompts: ["Agree", "Disagree", "Delay"]), pickOne: true)

            #expect(selection.variesByOption)
            #expect(selection.selectedVariant?.displayPrompt == "Agree")

            selection.move(by: 1)

            #expect(selection.selectedVariant?.displayPrompt == "Disagree")
            #expect(selection.selectedVariant?.answer == "Sentence 2")
            #expect(selection.keepIds == ["v2"])
        }

        @Test("should keep the shared front with options as rows when every option has the same question")
        func sharedFrontFallback() throws {
            let selection = PendingReviewTriageSelection(variants: try variants(prompts: ["Agree", "Agree", "Agree"]), pickOne: true)

            #expect(!selection.variesByOption)
        }

        @Test("should not vary the front on an ordinary card")
        func ordinaryCardNeverVaries() throws {
            let selection = PendingReviewTriageSelection(variants: try variants(prompts: ["A", "B", "C"]))

            #expect(!selection.variesByOption)
        }

        @Test("should label the position as N of M and clamp out-of-range indexes")
        func positionLabel() {
            #expect(TriageVariantFronts.positionLabel(index: 0, count: 3) == "1 of 3")
            #expect(TriageVariantFronts.positionLabel(index: 2, count: 3) == "3 of 3")
            #expect(TriageVariantFronts.positionLabel(index: 9, count: 3) == "3 of 3")
        }

        @Test("should pick the iOS card front and back from the chosen variant only when the questions differ")
        func iosPartsFollowChoice() throws {
            func parts(_ prompts: [String], index: Int) throws -> FocusTriageCardParts {
                let items = prompts.enumerated().map {
                    #"{"id":"s_\#($0.offset)","kind":"basic","prompt":"\#($0.element)","answer":"Sentence \#($0.offset + 1)"}"#
                }
                let bit = #"{"id":"b","body":"touch base","background":null,"origin":"extracted","variants":[\#(items.joined(separator: ","))],"answerChoice":true}"#
                let sources = try FocusTriageFixtures.sources([FocusTriageFixtures.source("s1", bits: [bit])])

                return FocusTriageCardParts(bit: sources[0].bits[0], source: sources[0], selectedIndex: index)
            }

            let varied = try parts(["Agree", "Disagree", "Delay"], index: 1)

            #expect(varied.front == "Disagree")
            #expect(varied.back == "Sentence 2")

            let shared = try parts(["Agree", "Agree", "Agree"], index: 1)

            #expect(shared.front == "Agree")
        }

        @Test("should vary the card by situation when the question is the same but the context differs")
        func contextDrivesVariation() throws {
            let json = """
            [{"id":"v1","kind":"basic","context":"talking to a manager","prompt":"Agree?","answer":"A1"},
             {"id":"v2","kind":"basic","context":"talking to a peer","prompt":"Agree?","answer":"A2"}]
            """
            let items = try JSONDecoder().decode([PendingReviewVariant].self, from: Data(json.utf8))
            let selection = PendingReviewTriageSelection(variants: items, pickOne: true)

            #expect(selection.variesByOption)
            #expect(selection.selectedVariant?.face == CardFace(context: "talking to a manager", front: "Agree?"))
        }

        @Test("should put the context above the iOS front and split an old two-line prompt the same way")
        func iosPartsCarryContext() throws {
            let bit = #"{"id":"b","body":"x","background":null,"origin":"extracted","variants":[{"id":"s_0","kind":"basic","prompt":"Q?\nat standup","answer":"A"}]}"#
            let sources = try FocusTriageFixtures.sources([FocusTriageFixtures.source("s1", bits: [bit])])
            let parts = FocusTriageCardParts(bit: sources[0].bits[0], source: sources[0])

            #expect(parts.context == "at standup")
            #expect(parts.front == "Q?")
        }

        @Test("should split a review card the same way and show its own context when given")
        func reviewCardFace() throws {
            let preview = #"{"again":1,"hard":2,"good":3,"easy":4}"#
            func card(_ extra: String, prompt: String) throws -> ReviewCard {
                let json = #"{"variantId":"v","knowledgeBitId":"b","kind":"basic",\#(extra)"prompt":"\#(prompt)","answer":"a","background":null,"phase":"new","leech":false,"intervalPreview":\#(preview)}"#

                return try JSONDecoder().decode(ReviewCard.self, from: Data(json.utf8))
            }

            #expect(try card(#""context":"to a manager","#, prompt: "Q?").face == CardFace(context: "to a manager", front: "Q?"))
            #expect(try card("", prompt: "Q?\\nat standup").face == CardFace(context: "at standup", front: "Q?"))
        }
    }
}
