import Foundation

public struct AdminSettings: Decodable, Sendable {
    public let testToggle: Bool
    public let modelTier: String
    public let knowledgeItemModelId: String?
}

public struct AdminStuckCourse: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let status: String
    public let stuckForMs: Double

    public var stuckText: String {
        let minutes = Int(stuckForMs / 60_000)

        return minutes >= 60 ? "stuck for \(minutes / 60)h \(minutes % 60)m" : "stuck for \(minutes)m"
    }
}

public struct AdminEvent: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let curriculumName: String?
    public let op: String
    public let agentKey: String
    public let durationMs: Double
    public let success: Bool
    public let errorMessage: String?
    public let totalTokens: Int?
}

public struct AdminMerge: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let entityType: String
    public let targetName: String
    public let sourceName: String
    public let reassignedCounts: [String: Int]

    public var countsText: String {
        reassignedCounts.sorted { $0.key < $1.key }.map { "\($0.value) \($0.key)" }.joined(separator: ", ")
    }
}

public struct AdminObservability: Decodable, Sendable {
    public let stuckCurricula: [AdminStuckCourse]
    public let recentEvents: [AdminEvent]
    public let recentMerges: [AdminMerge]
}

public struct AdminReasonCount: Decodable, Sendable, Hashable {
    public let reasonCode: String
    public let count: Int
}

public struct AdminModelFeedback: Decodable, Sendable, Hashable, Identifiable {
    public let modelId: String
    public let approved: Int
    public let rejected: Int
    public let topReasons: [AdminReasonCount]

    public var id: String { modelId }
}

public struct AdminFeedbackByModel: Decodable, Sendable {
    public let models: [AdminModelFeedback]
}

public struct AdminScanSummary: Decodable, Sendable {
    public let text: String

    public init(from decoder: Decoder) throws {
        let values = try decoder.singleValueContainer().decode([String: AdminScanValue].self)
        let parts = values.sorted { $0.key < $1.key }.compactMap { key, value in value.text.map { "\(key) \($0)" } }

        text = parts.isEmpty ? "finished" : parts.joined(separator: ", ")
    }
}

private struct AdminScanValue: Decodable {
    let text: String?

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if let number = try? container.decode(Int.self) {
            text = String(number)
        } else if let flag = try? container.decode(Bool.self) {
            text = flag ? "yes" : "no"
        } else {
            text = nil
        }
    }
}
