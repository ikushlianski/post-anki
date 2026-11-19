import Foundation

public enum ReviewMakeCardOutcome: Equatable, Sendable {
    case created
    case offline
    case failed(String)
}

public enum ReviewMakeCard {
    public static let frontMaxLength = 300
    public static let backMaxLength = 600
    public static let offlineMessage = "Making a card needs a connection. Try again when you are back online."
    public static let failureMessage = "Could not create the card. Try again."
    public static let createdMessage = "Card created"

    public static func selectedText(in text: String, range: NSRange) -> String {
        let whole = NSRange(location: 0, length: (text as NSString).length)
        let clipped = NSIntersectionRange(range, whole)

        guard clipped.length > 0 else { return "" }

        let picked = (text as NSString).substring(with: clipped).trimmingCharacters(in: .whitespacesAndNewlines)

        return String(picked.prefix(backMaxLength))
    }

    public static func canCreate(front: String, back: String) -> Bool {
        !front.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !back.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    public static func submit(
        bitId: String,
        front: String,
        back: String,
        canReachServer: Bool,
        send: (String, String, String) async throws -> Void = { bitId, front, back in
            _ = try await APIClient.createDerivedItem(id: bitId, card: CardProposal(front: front, back: back))
        }
    ) async -> ReviewMakeCardOutcome {
        guard canReachServer else { return .offline }

        guard canCreate(front: front, back: back) else { return .failed(failureMessage) }

        do {
            try await send(
                bitId,
                String(front.trimmingCharacters(in: .whitespacesAndNewlines).prefix(frontMaxLength)),
                String(back.trimmingCharacters(in: .whitespacesAndNewlines).prefix(backMaxLength))
            )

            return .created
        } catch {
            if ProgressLoadError.from(error) == .offline { return .offline }

            return .failed(failureMessage)
        }
    }
}
