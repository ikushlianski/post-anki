import PostAnkiAPI

enum ChatQueueProposalAccessibility {
    static func label(_ proposal: ChatQueueProposal, isBusy: Bool, errorMessage: String?) -> String {
        var parts = ["\(proposal.kind.label): \(proposal.front)"]

        if let state = statusText(proposal) {
            parts.append(state)
        } else if isBusy {
            parts.append("Saving")
        }

        if let errorMessage { parts.append("Error: \(errorMessage)") }

        return parts.joined(separator: ". ")
    }

    static func statusText(_ proposal: ChatQueueProposal) -> String? {
        switch proposal.status {
        case .pending: return nil
        case .accepted: return proposal.kind == .update ? "Card updated" : "Card added to review"
        case .rejected: return "Rejected"
        }
    }

    static func actionName(_ decision: String, _ proposal: ChatQueueProposal) -> String {
        "\(decision) \(proposal.kind == .update ? "update" : "new card"): \(proposal.front)"
    }
}
