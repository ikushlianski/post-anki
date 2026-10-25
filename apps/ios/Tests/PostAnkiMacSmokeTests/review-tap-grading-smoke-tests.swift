import CoreGraphics
import PostAnkiAPI
import Testing

extension SmokeTests {
    @Suite("Review taps reveal the answer, then grade by screen half")
    struct ReviewTapGradingSmokeTests {
        @Test("should grade Good on a right-half tap and Bad on a left-half tap")
        func sideMapsToGrade() {
            #expect(ReviewTapGrading.grade(for: ReviewTapSide.side(x: 250, width: 400)) == .good)
            #expect(ReviewTapGrading.grade(for: ReviewTapSide.side(x: 150, width: 400)) == .again)
            #expect(ReviewTapGrading.grade(for: ReviewTapSide.side(x: 200, width: 400)) == .good)
        }

        @Test("should reveal on any tap before the answer is shown, without grading")
        func tapRevealsFromEitherSide() {
            #expect(ReviewTapGrading.action(isRevealed: false, isGrading: false, side: .left) == .reveal)
            #expect(ReviewTapGrading.action(isRevealed: false, isGrading: false, side: .right) == .reveal)
        }

        @Test("should grade by side once the answer is shown")
        func tapGradesAfterReveal() {
            #expect(ReviewTapGrading.action(isRevealed: true, isGrading: false, side: .right) == .grade(.good))
            #expect(ReviewTapGrading.action(isRevealed: true, isGrading: false, side: .left) == .grade(.again))
        }

        @Test("should ignore every tap while a grade is being submitted")
        func tapsIgnoredWhileGrading() {
            #expect(ReviewTapGrading.action(isRevealed: true, isGrading: true, side: .right) == .ignore)
            #expect(ReviewTapGrading.action(isRevealed: true, isGrading: true, side: .left) == .ignore)
            #expect(ReviewTapGrading.action(isRevealed: false, isGrading: true, side: .left) == .ignore)
        }
    }
}
