import Foundation

public enum NotionSourceFrequency: String, CaseIterable, Codable, Sendable, Identifiable {
    case manual
    case daily
    case nightly

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .manual: "Manual only"
        case .daily: "Daily"
        case .nightly: "Nightly"
        }
    }

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)

        self = Self(rawValue: raw) ?? .manual
    }
}

public enum NotionRunStatus: String, Codable, Sendable {
    case running
    case ok
    case partial
    case failed
    case skippedBudget = "skipped_budget"
    case skippedNoConnection = "skipped_no_connection"
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)

        self = Self(rawValue: raw) ?? .unknown
    }
}

public struct NotionLastRun: Decodable, Hashable, Sendable {
    public let status: NotionRunStatus
    public let finishedAt: String?
    public let imported: Int
    public let removed: Int
    public let errorCode: String?

    private enum CodingKeys: String, CodingKey { case status, finishedAt, imported, removed, errorCode }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        status = try container.decode(NotionRunStatus.self, forKey: .status)
        finishedAt = container.lenientOptionalString(.finishedAt)
        imported = container.lenientInt(.imported)
        removed = container.lenientInt(.removed)
        errorCode = container.lenientOptionalString(.errorCode)
    }

    public init(status: NotionRunStatus, finishedAt: String?, imported: Int, removed: Int, errorCode: String? = nil) {
        self.errorCode = errorCode
        self.status = status
        self.finishedAt = finishedAt
        self.imported = imported
        self.removed = removed
    }
}

public struct NotionIngestionSource: Decodable, Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let pageUrl: String
    public let subjectId: String
    public let subjectPath: [String]
    public let itemsPerRun: Int
    public let frequency: NotionSourceFrequency
    public let removeAfterImport: Bool
    public let paused: Bool
    public let nextRunAt: String?
    public let lastRun: NotionLastRun?

    private enum CodingKeys: String, CodingKey {
        case id, name, pageUrl, subjectId, subjectPath, itemsPerRun
        case frequency, removeAfterImport, paused, nextRunAt, lastRun
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        id = try container.decode(String.self, forKey: .id)
        name = container.lenientOptionalString(.name) ?? ""
        pageUrl = container.lenientOptionalString(.pageUrl) ?? ""
        subjectId = try container.decode(String.self, forKey: .subjectId)
        subjectPath = (try? container.decodeIfPresent([String].self, forKey: .subjectPath)) ?? []
        itemsPerRun = container.lenientInt(.itemsPerRun, default: 10)
        frequency = (try? container.decodeIfPresent(NotionSourceFrequency.self, forKey: .frequency)) ?? .manual
        removeAfterImport = (try? container.decodeIfPresent(Bool.self, forKey: .removeAfterImport)) ?? false
        paused = (try? container.decodeIfPresent(Bool.self, forKey: .paused)) ?? false
        nextRunAt = container.lenientOptionalString(.nextRunAt)
        lastRun = (try? container.decodeIfPresent(NotionLastRun.self, forKey: .lastRun)) ?? nil
    }

    public init(
        id: String,
        name: String,
        pageUrl: String,
        subjectId: String,
        subjectPath: [String],
        itemsPerRun: Int,
        frequency: NotionSourceFrequency,
        removeAfterImport: Bool,
        paused: Bool,
        nextRunAt: String?,
        lastRun: NotionLastRun?
    ) {
        self.id = id
        self.name = name
        self.pageUrl = pageUrl
        self.subjectId = subjectId
        self.subjectPath = subjectPath
        self.itemsPerRun = itemsPerRun
        self.frequency = frequency
        self.removeAfterImport = removeAfterImport
        self.paused = paused
        self.nextRunAt = nextRunAt
        self.lastRun = lastRun
    }
}

struct NotionSourcesResponse: Decodable, Sendable {
    let sources: [NotionIngestionSource]
}

public struct NotionRunResult: Decodable, Hashable, Sendable {
    public let status: NotionRunStatus
    public let read: Int
    public let imported: Int
    public let skippedExisting: Int
    public let ignored: Int
    public let removed: Int
    public let removeFailed: Int
    public let truncated: Bool
    public let pendingAfterLimit: Int

    private enum CodingKeys: String, CodingKey {
        case status, read, imported, skippedExisting, ignored, removed, removeFailed, truncated, pendingAfterLimit
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        status = try container.decode(NotionRunStatus.self, forKey: .status)
        read = container.lenientInt(.read)
        imported = container.lenientInt(.imported)
        skippedExisting = container.lenientInt(.skippedExisting)
        ignored = container.lenientInt(.ignored)
        removed = container.lenientInt(.removed)
        removeFailed = container.lenientInt(.removeFailed)
        truncated = (try? container.decodeIfPresent(Bool.self, forKey: .truncated)) ?? false
        pendingAfterLimit = container.lenientInt(.pendingAfterLimit)
    }

    public init(
        status: NotionRunStatus,
        read: Int = 0,
        imported: Int = 0,
        skippedExisting: Int = 0,
        ignored: Int = 0,
        removed: Int = 0,
        removeFailed: Int = 0,
        truncated: Bool = false,
        pendingAfterLimit: Int = 0
    ) {
        self.truncated = truncated
        self.pendingAfterLimit = pendingAfterLimit
        self.status = status
        self.read = read
        self.imported = imported
        self.skippedExisting = skippedExisting
        self.ignored = ignored
        self.removed = removed
        self.removeFailed = removeFailed
    }
}

public enum NotionTokenOrigin: String, Sendable {
    case settings
    case env
    case none
}

public struct NotionConnectionStatus: Decodable, Hashable, Sendable {
    public let configured: Bool
    public let origin: NotionTokenOrigin
    public let canStoreToken: Bool

    private enum CodingKeys: String, CodingKey { case configured, origin, canStoreToken }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        configured = (try? container.decodeIfPresent(Bool.self, forKey: .configured)) ?? false
        origin = container.lenientOptionalString(.origin).flatMap(NotionTokenOrigin.init(rawValue:)) ?? .none
        canStoreToken = (try? container.decodeIfPresent(Bool.self, forKey: .canStoreToken)) ?? false
    }

    public init(configured: Bool, origin: NotionTokenOrigin, canStoreToken: Bool) {
        self.configured = configured
        self.origin = origin
        self.canStoreToken = canStoreToken
    }
}

public struct NotionConnectionCheck: Decodable, Hashable, Sendable {
    public let ok: Bool
    public let workspaceName: String?
    public let reason: String?

    private enum CodingKeys: String, CodingKey { case ok, workspaceName, reason }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        ok = (try? container.decodeIfPresent(Bool.self, forKey: .ok)) ?? false
        workspaceName = container.lenientOptionalString(.workspaceName)
        reason = container.lenientOptionalString(.reason)
    }

    public init(ok: Bool, workspaceName: String?, reason: String? = nil) {
        self.reason = reason
        self.ok = ok
        self.workspaceName = workspaceName
    }
}

public struct NotionSourceInput: Encodable, Sendable {
    public var name: String
    public var pageUrl: String
    public var subjectId: String
    public var itemsPerRun: Int
    public var frequency: NotionSourceFrequency
    public var removeAfterImport: Bool

    public init(
        name: String,
        pageUrl: String,
        subjectId: String,
        itemsPerRun: Int,
        frequency: NotionSourceFrequency,
        removeAfterImport: Bool
    ) {
        self.name = name
        self.pageUrl = pageUrl
        self.subjectId = subjectId
        self.itemsPerRun = itemsPerRun
        self.frequency = frequency
        self.removeAfterImport = removeAfterImport
    }
}

public struct NotionSourceUpdate: Encodable, Sendable {
    public var name: String?
    public var pageUrl: String?
    public var subjectId: String?
    public var itemsPerRun: Int?
    public var frequency: NotionSourceFrequency?
    public var removeAfterImport: Bool?
    public var paused: Bool?

    public init(
        name: String? = nil,
        pageUrl: String? = nil,
        subjectId: String? = nil,
        itemsPerRun: Int? = nil,
        frequency: NotionSourceFrequency? = nil,
        removeAfterImport: Bool? = nil,
        paused: Bool? = nil
    ) {
        self.name = name
        self.pageUrl = pageUrl
        self.subjectId = subjectId
        self.itemsPerRun = itemsPerRun
        self.frequency = frequency
        self.removeAfterImport = removeAfterImport
        self.paused = paused
    }
}

public enum NotionSourceLimits {
    public static let itemsPerRun = 1...100
    public static let defaultItemsPerRun = 10
}

public enum NotionPageLink {
    public static func isValid(_ raw: String) -> Bool {
        guard let url = URL(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
              url.scheme?.lowercased() == "https",
              let host = url.host()?.lowercased()
        else { return false }

        let allowed = host == "notion.so" || host == "www.notion.so" || host.hasSuffix(".notion.site")

        return allowed && pageId(from: url) != nil
    }

    private static func pageId(from url: URL) -> String? {
        let last = url.path.split(separator: "/").last.map(String.init) ?? ""
        let compact = last.replacingOccurrences(of: "-", with: "")

        guard compact.count >= 32 else { return nil }

        let tail = compact.suffix(32)

        return tail.allSatisfy(\.isHexDigit) ? String(tail).lowercased() : nil
    }
}
