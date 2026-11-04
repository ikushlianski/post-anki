import Foundation

public struct OwnerStatsDay: Decodable, Sendable, Equatable, Identifiable {
    public let date: String
    public let reviews: Int
    public let newCards: Int
    public let passed: Int

    public var id: String { date }

    public var accuracy: Double? { reviews > 0 ? min(1, Double(passed) / Double(reviews)) : nil }

    public init(date: String, reviews: Int, newCards: Int, passed: Int) {
        self.date = date
        self.reviews = reviews
        self.newCards = newCards
        self.passed = passed
    }

    enum CodingKeys: String, CodingKey { case date, reviews, newCards, passed }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        date = try container.decode(String.self, forKey: .date)
        reviews = container.lenientInt(.reviews)
        newCards = container.lenientInt(.newCards)
        passed = container.lenientInt(.passed)
    }
}

public struct OwnerLearningStats: Decodable, Sendable, Equatable {
    public let env: String
    public let todayReviews: Int
    public let daily: [OwnerStatsDay]
    public let currentStreak: Int
    public let longestStreak: Int
    public let accuracyOverall: Double?
    public let accuracyLast7: Double?

    public init(
        env: String, todayReviews: Int, daily: [OwnerStatsDay], currentStreak: Int, longestStreak: Int,
        accuracyOverall: Double?, accuracyLast7: Double?
    ) {
        self.env = env
        self.todayReviews = todayReviews
        self.daily = daily
        self.currentStreak = currentStreak
        self.longestStreak = longestStreak
        self.accuracyOverall = accuracyOverall
        self.accuracyLast7 = accuracyLast7
    }

    enum CodingKeys: String, CodingKey { case env, today, daily, streak, accuracy }
    enum TodayKeys: String, CodingKey { case reviews }
    enum StreakKeys: String, CodingKey { case current, longest }
    enum AccuracyKeys: String, CodingKey { case overall, last7 }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let today = try? container.nestedContainer(keyedBy: TodayKeys.self, forKey: .today)
        let streak = try? container.nestedContainer(keyedBy: StreakKeys.self, forKey: .streak)
        let accuracy = try? container.nestedContainer(keyedBy: AccuracyKeys.self, forKey: .accuracy)

        env = container.lenientOptionalString(.env) ?? ""
        todayReviews = today?.lenientInt(.reviews) ?? 0
        daily = ((try? container.decodeIfPresent(LossyArray<OwnerStatsDay>.self, forKey: .daily)) ?? nil)?.elements ?? []
        currentStreak = streak?.lenientInt(.current) ?? 0
        longestStreak = streak?.lenientInt(.longest) ?? 0
        accuracyOverall = accuracy.flatMap { (try? $0.decodeIfPresent(Double.self, forKey: .overall)) ?? nil }
        accuracyLast7 = accuracy.flatMap { (try? $0.decodeIfPresent(Double.self, forKey: .last7)) ?? nil }
    }
}

public struct OwnerSpendDay: Decodable, Sendable, Equatable, Identifiable {
    public let date: String
    public let cardsUsd: Double
    public let chatUsd: Double
    public let otherUsd: Double

    public var id: String { date }
    public var totalUsd: Double { cardsUsd + chatUsd + otherUsd }

    public init(date: String, cardsUsd: Double, chatUsd: Double, otherUsd: Double) {
        self.date = date
        self.cardsUsd = cardsUsd
        self.chatUsd = chatUsd
        self.otherUsd = otherUsd
    }

    enum CodingKeys: String, CodingKey { case date, cardsUsd, chatUsd, otherUsd }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        date = try container.decode(String.self, forKey: .date)
        cardsUsd = Self.amount(container, .cardsUsd)
        chatUsd = Self.amount(container, .chatUsd)
        otherUsd = Self.amount(container, .otherUsd)
    }

    private static func amount(_ container: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> Double {
        ((try? container.decodeIfPresent(Double.self, forKey: key)) ?? nil) ?? 0
    }
}

public struct OwnerTriageModel: Decodable, Sendable, Equatable, Identifiable {
    public let modelId: String
    public let kept: Int
    public let rejected: Int

    public var id: String { modelId }

    enum CodingKeys: String, CodingKey { case modelId, kept, rejected }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        modelId = try container.decode(String.self, forKey: .modelId)
        kept = container.lenientInt(.kept)
        rejected = container.lenientInt(.rejected)
    }
}

public struct OwnerAiSpend: Decodable, Sendable, Equatable {
    public let env: String
    public let days: [OwnerSpendDay]
    public let unpricedCalls: Int
    public let unpricedTokens: Int
    public let triageByModel: [OwnerTriageModel]

    public var totalUsd: Double { days.reduce(0) { $0 + $1.totalUsd } }

    public init(
        env: String, days: [OwnerSpendDay], unpricedCalls: Int, unpricedTokens: Int, triageByModel: [OwnerTriageModel] = []
    ) {
        self.env = env
        self.days = days
        self.unpricedCalls = unpricedCalls
        self.unpricedTokens = unpricedTokens
        self.triageByModel = triageByModel
    }

    enum CodingKeys: String, CodingKey { case env, days, unpriced, triageByModel }
    enum UnpricedKeys: String, CodingKey { case calls, tokens }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let unpriced = try? container.nestedContainer(keyedBy: UnpricedKeys.self, forKey: .unpriced)

        env = container.lenientOptionalString(.env) ?? ""
        days = ((try? container.decodeIfPresent(LossyArray<OwnerSpendDay>.self, forKey: .days)) ?? nil)?.elements ?? []
        unpricedCalls = unpriced?.lenientInt(.calls) ?? 0
        unpricedTokens = unpriced?.lenientInt(.tokens) ?? 0
        triageByModel = ((try? container.decodeIfPresent(LossyArray<OwnerTriageModel>.self, forKey: .triageByModel)) ?? nil)?.elements ?? []
    }
}
