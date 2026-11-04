enum SubjectListNotice {
    static let learningList = "Couldn't load your subjects, so sorting and saving links are unavailable."
    static let moveSheet = "Couldn't load subjects, so this can't be moved right now."
    static let rejectedFilter = "Couldn't load subjects for the filter."

    static func learningListMessage(failed: Bool, subjectCount: Int) -> String? {
        failed && subjectCount == 0 ? learningList : nil
    }

    static func rejectedFilterMessage(failed: Bool, optionCount: Int) -> String? {
        failed && optionCount == 0 ? rejectedFilter : nil
    }

    static func moveSheetMessage(failed: Bool, subjectCount: Int) -> String? {
        failed && subjectCount == 0 ? moveSheet : nil
    }
}
