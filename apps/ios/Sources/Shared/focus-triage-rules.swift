import PostAnkiAPI

enum FocusTriageNote {
    static let maxCharacters = 500

    static func trimmed(_ raw: String) -> String? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)

        return text.isEmpty ? nil : String(text.prefix(maxCharacters))
    }
}

enum FocusTriageFeedback {
    static let maxCharacters = 8_000

    static func trimmed(_ raw: String) -> String? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)

        return text.isEmpty ? nil : String(text.prefix(maxCharacters))
    }
}

enum FocusTriageSubject {
    static func single(_ sources: [PendingReviewSource]) -> String? {
        let withBits = sources.filter { !$0.bits.isEmpty }
        let first = withBits.first?.subjectId

        guard let first, withBits.allSatisfy({ $0.subjectId == first }) else { return nil }

        return first
    }

    static func filter(_ sources: [PendingReviewSource], subjectId: String?) -> [PendingReviewSource] {
        guard let subjectId else { return sources }

        return sources.filter { $0.subjectId == subjectId }
    }

    static func options(_ sources: [PendingReviewSource]) -> [(id: String?, name: String, readyCount: Int)] {
        var order: [String] = []
        var names: [String: String] = [:]
        var counts: [String: Int] = [:]
        var total = 0

        for source in sources {
            let ready = source.bits.filter { !$0.variants.isEmpty }.count

            total += ready

            guard let id = source.subjectId else { continue }

            if counts[id] == nil { order.append(id) }

            counts[id, default: 0] += ready

            if names[id] == nil, let name = source.subjectName, !name.isEmpty { names[id] = name }
        }

        let subjects = order.map { (id: Optional($0), name: names[$0] ?? "Untitled subject", readyCount: counts[$0] ?? 0) }

        return [(id: nil, name: "All subjects", readyCount: total)] + subjects
    }
}

enum FocusTriagePollPlan {
    static let interval: Duration = .seconds(8)
    static let maxAttempts = 40

    static func shouldPoll(waiting: Int, attempts: Int) -> Bool {
        waiting > 0 && attempts < maxAttempts
    }
}
