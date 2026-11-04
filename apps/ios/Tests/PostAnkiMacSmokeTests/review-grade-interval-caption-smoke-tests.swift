import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @Suite("Grade buttons show the server's next interval and Add explains its input")
    struct ReviewGradeIntervalCaptionSmokeTests {
        private let preview = try! JSONDecoder().decode(
            IntervalPreview.self,
            from: Data(#"{"again":60,"hard":360,"good":600,"easy":345600}"#.utf8)
        )

        @Test("should caption each grade with the interval the server previewed for it")
        func captionsFromServerPreview() {
            let captions = DueReviewGradeOptions.ordered.map {
                DueReviewGradeOptions.intervalCaption(for: $0.grade, preview: preview)
            }

            #expect(captions == ["1m", "6m", "10m", "4d"])
        }

        @Test("should show no caption when the card carries no interval preview")
        func noPreviewNoCaption() {
            for option in DueReviewGradeOptions.ordered {
                #expect(DueReviewGradeOptions.intervalCaption(for: option.grade, preview: nil) == nil)
            }
        }

        @Test("should tell the user they can paste or type what they want to remember")
        func addPlaceholder() {
            #expect(AddKnowledgeInput.placeholder == "Paste or type what you want to remember")
        }
    }
}
