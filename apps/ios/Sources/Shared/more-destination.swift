enum MoreSection: String, CaseIterable, Identifiable {
    case library
    case study
    case account

    var id: String { rawValue }

    var title: String {
        switch self {
        case .library: "Library"
        case .study: "Study"
        case .account: "Account"
        }
    }

    var destinations: [MoreDestination] {
        MoreDestination.allCases.filter { $0.section == self }
    }
}

enum MoreDestination: String, CaseIterable, Identifiable {
    case knowledge
    case subjects
    case notes
    case search
    case tags
    case duplicates
    case today
    case progress
    case statistics
    case learningList
    case studySessions
    case triageHistory
    case studyPlan
    case settings
    case account
    case about

    var id: String { rawValue }

    var section: MoreSection {
        switch self {
        case .knowledge, .subjects, .notes, .search, .tags, .duplicates: .library
        case .today, .progress, .statistics, .learningList, .studySessions, .triageHistory, .studyPlan: .study
        case .settings, .account, .about: .account
        }
    }

    var title: String {
        switch self {
        case .knowledge: "Knowledge"
        case .subjects: "Subjects"
        case .today: "Today"
        case .progress: "Progress"
        case .statistics: "Statistics"
        case .learningList: "Learning list"
        case .studySessions: "Study sessions"
        case .triageHistory: "Triage history"
        case .studyPlan: "Study plan"
        case .notes: "Notes"
        case .search: "Search"
        case .tags: "Tags"
        case .duplicates: "Duplicates"
        case .settings: "Settings"
        case .account: "Account"
        case .about: "About"
        }
    }

    var systemImage: String {
        switch self {
        case .knowledge: "books.vertical"
        case .subjects: "book"
        case .today: "sun.max"
        case .progress: "chart.bar"
        case .statistics: "chart.xyaxis.line"
        case .learningList: "list.bullet.clipboard"
        case .studySessions: "calendar"
        case .triageHistory: "clock.arrow.circlepath"
        case .studyPlan: "calendar.badge.clock"
        case .notes: "note.text"
        case .search: "magnifyingglass"
        case .tags: "tag"
        case .duplicates: "square.on.square"
        case .settings: "gearshape"
        case .account: "person.crop.circle"
        case .about: "info.circle"
        }
    }
}
