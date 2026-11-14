import PostAnkiAPI

enum ReviewSubjectGroups {
    static func cardsLeft(in subjectPath: String?, current: ReviewCard?, queue: [ReviewCard]) -> Int {
        guard let current, current.subjectPath == subjectPath else { return 0 }

        let following = queue.prefix { $0.subjectPath == subjectPath }.count

        return 1 + following
    }

    static func announcement(subjectPath: String, cardsInGroup: Int, remainingOverall: Int) -> String {
        let group = cardsInGroup == 1 ? "1 card" : "\(cardsInGroup) cards"
        let overall = remainingOverall == 1 ? "1 card" : "\(remainingOverall) cards"

        return "Next subject: \(subjectPath) · \(group) here, \(overall) left in total"
    }
}
