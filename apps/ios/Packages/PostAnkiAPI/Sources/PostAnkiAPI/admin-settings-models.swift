import Foundation

public struct AdminSettingsUpdate: Encodable, Sendable {
    public var testToggle: Bool?
    public var modelTier: String?
    public var knowledgeItemModelId: String?
    public var newCardsPerDay: Int?
    public var maxReviewsPerDay: Int?
    public var mixNewWithDue: Bool?
    public var triageEnabled: Bool?
    public var fusionEnabled: Bool?
    public var fusionModelIds: [String]?

    public init(
        testToggle: Bool? = nil,
        modelTier: String? = nil,
        knowledgeItemModelId: String? = nil,
        newCardsPerDay: Int? = nil,
        maxReviewsPerDay: Int? = nil,
        mixNewWithDue: Bool? = nil,
        triageEnabled: Bool? = nil,
        fusionEnabled: Bool? = nil,
        fusionModelIds: [String]? = nil
    ) {
        self.fusionEnabled = fusionEnabled
        self.fusionModelIds = fusionModelIds
        self.testToggle = testToggle
        self.modelTier = modelTier
        self.knowledgeItemModelId = knowledgeItemModelId
        self.newCardsPerDay = newCardsPerDay
        self.maxReviewsPerDay = maxReviewsPerDay
        self.mixNewWithDue = mixNewWithDue
        self.triageEnabled = triageEnabled
    }
}

public struct AdminModelTier: Sendable, Hashable, Identifiable {
    public let id: String
    public let label: String

    public static let all = [
        AdminModelTier(id: "cheap", label: "Cheap"),
        AdminModelTier(id: "balanced", label: "Balanced"),
        AdminModelTier(id: "premium", label: "Premium")
    ]
}

public struct AdminExtractionModel: Sendable, Hashable, Identifiable {
    public let id: String
    public let label: String
    public let inputPerMillion: Double
    public let outputPerMillion: Double
    public let note: String

    public var priceText: String {
        "$\(Self.format(inputPerMillion)) in / $\(Self.format(outputPerMillion)) out per 1M"
    }

    private static func format(_ value: Double) -> String {
        if value >= 0.1 { return String(format: "%.2f", value) }

        var text = String(format: "%.3f", value)

        while text.hasSuffix("0") { text.removeLast() }

        if text.hasSuffix(".") { text.removeLast() }

        return text
    }

    public static let pricesCheckedOn = "2026-10-11"
    public static let defaultId = "openrouter/anthropic/claude-haiku-5.5"
}

public enum AdminSettingsLimits {
    public static let newCardsPerDay = 1...200
    public static let defaultNewCardsPerDay = 20
    public static let maxReviewsPerDay = 0...9999
    public static let defaultMaxReviewsPerDay = 200
}
