import Foundation

public enum ChatQueueSubjectFilter {
    private static let separator = RejectedSubjectOptions.separator

    public static func subjects(_ items: [ChatQueueItem]) -> [String] {
        let names = items.compactMap { $0.subjectName?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        var all = Set<String>()

        for name in names {
            let parts = name.components(separatedBy: separator)

            for end in 1...parts.count {
                all.insert(parts[0..<end].joined(separator: separator))
            }
        }

        return all.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    public static func apply(_ items: [ChatQueueItem], subject: String?) -> [ChatQueueItem] {
        guard let subject, subjects(items).contains(subject) else { return items }

        return items.filter { item in
            guard let name = item.subjectName else { return false }

            return name == subject || name.hasPrefix(subject + separator)
        }
    }
}
