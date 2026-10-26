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

    static func tint(for grade: ReviewGrade) -> Color {
        switch grade {
        case .again: return .red
        case .hard: return .orange
        case .good: return .green
        case .easy: return .blue
        }
    }
}
