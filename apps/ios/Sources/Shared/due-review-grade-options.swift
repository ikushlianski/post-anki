import PostAnkiAPI
import SwiftUI

struct DueReviewGradeOption: Equatable {
    let title: String
    let grade: ReviewGrade
}

enum DueReviewGradeOptions {
    static let ordered: [DueReviewGradeOption] = [
        DueReviewGradeOption(title: "Again", grade: .again),
        DueReviewGradeOption(title: "Hard", grade: .hard),
        DueReviewGradeOption(title: "Good", grade: .good),
        DueReviewGradeOption(title: "Easy", grade: .easy),
    ]

    static let rehearsalOrdered: [DueReviewGradeOption] = [
        DueReviewGradeOption(title: "Missed it", grade: .again),
        DueReviewGradeOption(title: "Got it", grade: .good),
    ]

    static let rehearsalLabel = "Same idea, new wording"

    static func options(rehearsal: Bool) -> [DueReviewGradeOption] {
        rehearsal ? rehearsalOrdered : ordered
    }

    static func tint(for grade: ReviewGrade) -> Color {
        switch grade {
        case .again: return .red
        case .hard: return .orange
        case .good: return .green
        case .easy: return .blue
        }
    }

    static func intervalCaption(for grade: ReviewGrade, preview: IntervalPreview?) -> String? {
        guard let preview else { return nil }

        return IntervalFormat.short(seconds: preview.seconds(for: grade))
    }
}
