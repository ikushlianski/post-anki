import Foundation

enum AnswerButtonLayout {
    static let minHeight: CGFloat = 56
    static let spacing: CGFloat = 12
    static let cornerRadius: CGFloat = 14
}

enum AnswerButtonSize: String, CaseIterable, Identifiable {
    case xs, s, m, l, xl, xxl

    static let defaultSize = AnswerButtonSize.l

    var id: String { rawValue }

    var title: String { rawValue.uppercased() }

    var height: CGFloat {
        switch self {
        case .xs: AnswerButtonLayout.minHeight
        case .s: 68
        case .m: 84
        case .l: 96
        case .xl: 112
        case .xxl: 128
        }
    }
}

struct AnswerButtonSizeStore {
    static let key = "answerButtonSize"

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func load() -> AnswerButtonSize {
        defaults.string(forKey: Self.key).flatMap(AnswerButtonSize.init(rawValue:)) ?? .defaultSize
    }

    func save(_ size: AnswerButtonSize) {
        defaults.set(size.rawValue, forKey: Self.key)
    }
}
