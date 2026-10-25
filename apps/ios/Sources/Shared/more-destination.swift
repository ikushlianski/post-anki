enum MoreDestination: String, CaseIterable, Identifiable {
    case today
    case progress
    case learningList
    case studySessions
    case notes
    case search
    case tags
    case duplicates
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: "Today"
        case .progress: "Progress"
        case .learningList: "Learning list"
        case .studySessions: "Study sessions"
        case .notes: "Notes"
        case .search: "Search"
        case .tags: "Tags"
        case .duplicates: "Duplicates"
        case .settings: "Settings"
        }
    }

    var systemImage: String {
        switch self {
        case .today: "sun.max"
        case .progress: "chart.bar"
        case .learningList: "list.bullet.clipboard"
        case .studySessions: "calendar"
        case .notes: "note.text"
        case .search: "magnifyingglass"
        case .tags: "tag"
        case .duplicates: "square.on.square"
        case .settings: "gearshape"
        }
    }
}
