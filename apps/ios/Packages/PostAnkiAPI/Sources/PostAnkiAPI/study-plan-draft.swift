import Foundation

public enum StudyIntentChoice: String, Sendable, CaseIterable, Identifiable {
    case inherit
    case exam
    case longTerm

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .inherit: return "Same as parent"
        case .exam: return "Exam"
        case .longTerm: return "Long-term"
        }
    }
}

public struct StudyPlanDraft: Sendable, Equatable {
    public static let retentionRange = 70...99
    public static let newCardsRange = 1...200
    public static let reviewsRange = 0...9999
    public static let defaultMaxReviewsPerDay = 200
    public static let defaultRetentionPercent = 90
    public static let defaultNewCardsPerDay = 20

    public var intent: StudyIntentChoice
    public var examDate: String?
    public var retentionPercent: Int?
    public var complexityLevel: ComplexityLevel?
    public var newCardsPerDay: Int?
    public var maxReviewsPerDay: Int?
    public var detailLevel: DetailLevel?
    public var hintingEnabled: Bool?

    public init(
        intent: StudyIntentChoice,
        examDate: String?,
        retentionPercent: Int?,
        newCardsPerDay: Int?,
        detailLevel: DetailLevel? = nil,
        hintingEnabled: Bool? = nil,
        maxReviewsPerDay: Int? = nil,
        complexityLevel: ComplexityLevel? = nil
    ) {
        self.complexityLevel = complexityLevel
        self.maxReviewsPerDay = maxReviewsPerDay
        self.detailLevel = detailLevel
        self.hintingEnabled = hintingEnabled
        self.intent = intent
        self.examDate = examDate
        self.retentionPercent = retentionPercent
        self.newCardsPerDay = newCardsPerDay
    }

    public init(_ options: SubjectStudyOptions) {
        let own = options.own

        switch own.studyIntent {
        case nil: intent = .inherit
        case .exam?: intent = .exam
        case .longTerm?: intent = .longTerm
        }

        examDate = own.examDate
        retentionPercent = own.desiredRetention.map(Self.percent)
        complexityLevel = own.desiredRetention == nil ? own.complexityLevel : nil
        newCardsPerDay = own.newCardsPerDay
        maxReviewsPerDay = own.maxReviewsPerDay
        detailLevel = own.detailLevel
        hintingEnabled = own.hintingEnabled
    }

    public static func percent(_ retention: Double) -> Int {
        Int((retention * 100).rounded())
    }

    public var ownsExamDate: Bool { intent == .exam }

    public func validationMessage(today: String) -> String? {
        guard intent == .exam else { return nil }

        guard let examDate else { return StudyPlanRefusal.examDateRequired.message }

        return examDate < today ? StudyPlanRefusal.examDateInPast.message : nil
    }

    public func update(from options: SubjectStudyOptions) -> SubjectStudyOptionsUpdate {
        let original = StudyPlanDraft(options)
        var update = SubjectStudyOptionsUpdate()

        if intent != original.intent || (intent == .exam && examDate != original.examDate) {
            switch intent {
            case .inherit:
                update.studyIntent = .inherit
            case .longTerm:
                update.studyIntent = .set(.longTerm)
            case .exam:
                update.studyIntent = .set(.exam)

                if let examDate { update.examDate = .set(examDate) }
            }
        }

        if retentionPercent != original.retentionPercent {
            update.desiredRetention = retentionPercent.map { .set(Double($0) / 100) } ?? .inherit
        }

        if complexityLevel != original.complexityLevel {
            update.complexityLevel = complexityLevel.map { .set($0) } ?? .inherit
        }

        if newCardsPerDay != original.newCardsPerDay {
            update.newCardsPerDay = newCardsPerDay.map { .set($0) } ?? .inherit
        }

        if maxReviewsPerDay != original.maxReviewsPerDay {
            update.maxReviewsPerDay = maxReviewsPerDay.map { .set($0) } ?? .inherit
        }

        if detailLevel != original.detailLevel {
            update.detailLevel = detailLevel.map { .set($0) } ?? .inherit
        }

        if hintingEnabled != original.hintingEnabled {
            update.hintingEnabled = hintingEnabled.map { .set($0) } ?? .inherit
        }

        return update
    }
}

public enum StudyPlanSource {
    public static func text(source: String, subjectId: String, names: [String: String]) -> String {
        if source == subjectId { return "Set on this subject." }

        if source == "app" { return "Using the app default." }

        if let name = names[source] { return "Inherited from \(name)." }

        return "Inherited from a parent subject."
    }
}
