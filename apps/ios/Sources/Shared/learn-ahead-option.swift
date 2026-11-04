import Foundation

enum LearnAheadOption: Int, CaseIterable, Identifiable, Sendable {
    case off = 0
    case oneDay = 1
    case twoDays = 2
    case threeDays = 3
    case sevenDays = 7

    static let maxDays = 30

    var id: Int { rawValue }
    var days: Int { rawValue }

    var title: String {
        switch self {
        case .off: "Off"
        case .oneDay: "1 day"
        default: "\(rawValue) days"
        }
    }

    static func clamped(_ days: Int) -> Int { min(max(days, 0), maxDays) }

    static func label(days: Int) -> String? {
        switch days {
        case ...0: nil
        case 1: "Learning ahead 1 day"
        default: "Learning ahead \(days) days"
        }
    }
}
