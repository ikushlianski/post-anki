public enum AddKnowledgeDraft {
    public static func pasting(_ pasted: String, into current: String) -> String {
        let clip = pasted.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !clip.isEmpty else { return current }

        guard !current.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return clip }

        return current.hasSuffix("\n") ? current + clip : current + "\n" + clip
    }
}

public enum ReviewGradeHaptic: Sendable, Equatable {
    case light
    case strong

    public static func kind(for grade: ReviewGrade) -> ReviewGradeHaptic {
        grade == .again ? .strong : .light
    }
}
