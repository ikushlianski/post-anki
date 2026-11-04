import Foundation

public struct FusionEstimate: Decodable, Sendable, Hashable {
    public struct PerModel: Decodable, Sendable, Hashable {
        public let modelId: String
        public let estimatedCostUsd: Double
    }

    public let perModel: [PerModel]
    public let totalEstimatedCostUsd: Double

    public var totalText: String {
        Self.format(totalEstimatedCostUsd)
    }

    public func costText(for modelId: String) -> String? {
        perModel.first(where: { $0.modelId == modelId }).map { Self.format($0.estimatedCostUsd) }
    }

    static func format(_ value: Double) -> String {
        if value > 0 && value < 0.01 { return "<$0.01" }

        return "$" + String(format: "%.2f", value)
    }
}

public enum FusionSelection {
    public static let minModels = 2
    public static let maxModels = 5

    public static func toggled(_ ids: [String], id: String) -> [String] {
        if ids.contains(id) { return ids.filter { $0 != id } }

        guard ids.count < maxModels else { return ids }

        return ids + [id]
    }

    public static func canAdd(_ ids: [String]) -> Bool {
        ids.count < maxModels
    }

    public static func needsMoreModels(enabled: Bool, count: Int) -> Bool {
        enabled && count < minModels
    }

    public static func hint(enabled: Bool, count: Int) -> String? {
        needsMoreModels(enabled: enabled, count: count)
            ? "Pick at least \(minModels) models to turn fusion on."
            : nil
    }
}

public struct AdminSettingsRefusal: Error, Sendable, Equatable {
    public let message: String

    public init(message: String) {
        self.message = message
    }

    static func decode(from data: Data) -> AdminSettingsRefusal? {
        guard let body = try? JSONDecoder().decode(RefusalBody.self, from: data),
              body.error == "invalid_input" else { return nil }

        let text = body.message?.texts.joined(separator: " ") ?? ""

        return AdminSettingsRefusal(message: text.isEmpty ? "The server refused these settings." : text)
    }
}

private struct RefusalBody: Decodable {
    let error: String?
    let message: RefusalText?
}

private struct RefusalText: Decodable {
    let texts: [String]

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if let text = try? container.decode(String.self) {
            texts = [text]
        } else if let items = try? container.decode([RefusalItem].self) {
            texts = items.compactMap(\.text)
        } else {
            texts = []
        }
    }
}

private struct RefusalItem: Decodable {
    let text: String?

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if let value = try? container.decode(String.self) {
            text = value
        } else if let object = try? container.decode(RefusalIssue.self) {
            text = object.message
        } else {
            text = nil
        }
    }
}

private struct RefusalIssue: Decodable {
    let message: String?
}
