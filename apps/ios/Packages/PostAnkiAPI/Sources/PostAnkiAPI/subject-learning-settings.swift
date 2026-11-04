import Foundation

public enum DetailLevel: String, Codable, Sendable, CaseIterable, Identifiable {
    case concise
    case standard
    case deep

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .concise: return "Concise"
        case .standard: return "Standard"
        case .deep: return "Deep"
        }
    }

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)

        self = DetailLevel(rawValue: raw) ?? .standard
    }
}
