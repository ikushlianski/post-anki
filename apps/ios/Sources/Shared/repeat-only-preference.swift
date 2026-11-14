import Foundation

enum RepeatOnlyPreference {
    static let key = "dueReview.repeatOnly"

    static var isOn: Bool {
        get { UserDefaults.standard.bool(forKey: key) }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}
