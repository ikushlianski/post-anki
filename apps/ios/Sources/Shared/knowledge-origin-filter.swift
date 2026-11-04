import Foundation

enum KnowledgeOriginFilter: String, CaseIterable, Identifiable {
    case all
    case manual
    case aiWeb = "ai_web"
    case pasted
    case notion
    case article

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "All origins"
        case .manual: return "Typed by you"
        case .aiWeb: return "Found by AI on the web"
        case .pasted: return "Pasted text"
        case .notion: return "Notion"
        case .article: return "Article"
        }
    }

    var origins: [String] { self == .all ? [] : [rawValue] }
}
