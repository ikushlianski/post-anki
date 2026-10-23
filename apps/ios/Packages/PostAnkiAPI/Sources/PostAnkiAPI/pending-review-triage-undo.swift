import Foundation

public struct PendingReviewTriageResponse: Decodable, Sendable {
    public let droppedVariantIds: [String]

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        droppedVariantIds = try container.decodeIfPresent([String].self, forKey: .droppedVariantIds) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case droppedVariantIds
    }
}

public struct PendingReviewTriageUndoInput: Encodable, Sendable {
    public let restoreVariantIds: [String]
}

public enum PendingReviewTriageUndoOutcome: Sendable, Equatable {
    case restored
    case unavailable(message: String)
    case retryable(message: String)

    public static func outcome(for error: Error) -> PendingReviewTriageUndoOutcome {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotConnectToHost:
                return .retryable(message: "You're offline. Press Z to try the undo again.")
            default:
                break
            }
        }

        if let apiError = error as? APIError {
            switch apiError {
            case .badStatus(409, "slot_taken"):
                return .unavailable(message: "Couldn't undo. A newer question now uses one of those places.")
            case .badStatus(409, _), .badStatus(404, _), .badStatus(400, _):
                return .unavailable(message: "Couldn't undo. This piece was changed since you kept it.")
            case .unauthorized:
                return .unavailable(message: "Your access token was rejected. Check Settings.")
            default:
                break
            }
        }

        return .retryable(message: "Couldn't undo. Press Z to try again.")
    }
}
