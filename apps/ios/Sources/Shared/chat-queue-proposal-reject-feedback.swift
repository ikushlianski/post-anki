import PostAnkiAPI

enum ChatQueueProposalRejectFeedback {
    static let noteMaxCharacters = 500

    static func text(reason: RejectReason?, note: String) -> String {
        [reason?.label ?? "", note.trimmingCharacters(in: .whitespacesAndNewlines)]
            .filter { !$0.isEmpty }
            .joined(separator: ": ")
    }

    static func message(front: String, feedback: String?) -> String {
        guard let feedback, !feedback.isEmpty else {
            return "I rejected your proposed card: \(front)."
        }

        return "I rejected your proposed card: \(front). What is wrong: \(feedback)"
    }
}
