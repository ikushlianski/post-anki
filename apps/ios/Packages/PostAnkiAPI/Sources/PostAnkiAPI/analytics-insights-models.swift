import Foundation

public enum InsightState<Value: Sendable>: Sendable {
    case loading
    case failed(String)
    case ready(Value)

    public var value: Value? {
        if case .ready(let value) = self { return value }

        return nil
    }
}

public struct RejectReasonShare: Decodable, Sendable, Equatable, Identifiable {
    public let reasonCode: String
    public let count: Int
    public let share: Double

    public var id: String { reasonCode }

    public var label: String { RejectedCardReason.label(forCode: reasonCode) }

    public var percentText: String { "\(Int((share * 100).rounded()))%" }

    public var summary: String { "\(label): \(count) (\(percentText))" }
}

public struct RejectReasonsBySubjectType: Decodable, Sendable, Equatable, Identifiable {
    public let subjectType: String
    public let total: Int
    public let reasons: [RejectReasonShare]

    public var id: String { subjectType }

    public var title: String { subjectType.capitalized }

    enum CodingKeys: String, CodingKey { case subjectType, total, reasons }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        subjectType = try container.decode(String.self, forKey: .subjectType)
        total = container.lenientInt(.total)
        reasons = ((try? container.decodeIfPresent(LossyArray<RejectReasonShare>.self, forKey: .reasons)) ?? nil)?.elements ?? []
    }
}

public struct RejectReasonsStatistics: Decodable, Sendable, Equatable {
    public let total: Int
    public let reasons: [RejectReasonShare]
    public let bySubjectType: [RejectReasonsBySubjectType]

    enum CodingKeys: String, CodingKey { case total, reasons, bySubjectType }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        total = try container.decode(Int.self, forKey: .total)
        reasons = try container.decode([RejectReasonShare].self, forKey: .reasons)
        bySubjectType = ((try? container.decodeIfPresent(LossyArray<RejectReasonsBySubjectType>.self, forKey: .bySubjectType)) ?? nil)?.elements ?? []
    }
}

public struct NothingExtractedWeek: Decodable, Sendable, Equatable, Identifiable {
    public let weekStart: String
    public let processed: Int
    public let nothingExtracted: Int
    public let rate: Double

    public var id: String { weekStart }

    public var percentText: String { "\(Int((rate * 100).rounded()))%" }
}

public struct NothingExtractedStatistics: Decodable, Sendable, Equatable {
    public let weekly: [NothingExtractedWeek]

    public var latestActive: NothingExtractedWeek? { weekly.last { $0.processed > 0 } }

    public var summary: String? {
        guard let week = latestActive else { return nil }

        return "Latest week with notes: \(week.percentText) gave no cards (\(week.nothingExtracted) of \(week.processed))"
    }

    public static let emptyText = "No notes processed in the last 12 weeks"
}

public struct ChatQueueOutcomesStatistics: Decodable, Sendable, Equatable {
    public let windowDays: Int
    public let total: Int
    public let accepted: Int
    public let rejected: Int
    public let waiting: Int
    public let snoozed: Int

    public struct Row: Equatable, Sendable, Identifiable {
        public let label: String
        public let count: Int
        public let share: Double

        public var id: String { label }

        public var summary: String { "\(label): \(count) (\(Int((share * 100).rounded()))%)" }
    }

    public var rows: [Row] {
        guard total > 0 else { return [] }

        return [("Accepted", accepted), ("Rejected", rejected), ("Still waiting", waiting), ("Snoozed", snoozed)]
            .map { Row(label: $0.0, count: $0.1, share: Double($0.1) / Double(total)) }
    }

    public var totalText: String { "\(total) cards sent to Chat in the last \(windowDays) days" }

    public var emptyText: String { "No cards were sent to Chat in the last \(windowDays) days" }
}
