import Foundation

public struct DecideBlindSpot: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let description: String
    public let status: String
}

public struct DecideSession: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let decision: String
    public let opinion: String
    public let verdict: String
    public let strengths: [String]
    public let questions: [String]
    public var blindSpots: [DecideBlindSpot]
    public let createdAt: String
}

public struct CreateDecideSessionInput: Encodable, Sendable {
    public let decision: String
    public let opinion: String
}

public struct ResolveBlindSpotInput: Encodable, Sendable {
    public let status: String
}

public enum DecideError: Sendable {
    public static func message(for error: Error) -> String {
        if case APIError.badStatus(502, _) = error {
            return "The reviewer is unavailable right now. Try again."
        }

        return StudyToolsError.message(for: error, notFound: "That item is gone.")
    }
}
