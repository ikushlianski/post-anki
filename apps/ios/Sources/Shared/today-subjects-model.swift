import Foundation
import Observation
import PostAnkiAPI

struct TodaySubject: Equatable, Identifiable {
    let id: String
    let name: String
    let todayCount: Int
    let isSkipped: Bool
}

struct TodaySubjectCard: Equatable, Identifiable {
    let id: String
    let front: String
}

enum TodaySubjectCards: Equatable {
    case loading
    case loaded([TodaySubjectCard])
    case failed
}

@Observable
@MainActor
final class TodaySubjectsModel {
    static let cardLimit = 100

    private(set) var subjects: [TodaySubject] = []
    private(set) var unsortedToday = 0
    private(set) var reviewsRemainingToday: Int?
    private(set) var cards: [String: TodaySubjectCards] = [:]
    private(set) var hasLoaded = false
    private(set) var loadFailed = false
    private(set) var toggleError: String?
    private(set) var changeCount = 0
    var expanded: Set<String> = []

    private var childrenByParent: [String: [String]] = [:]
    private let reviewPack: ReviewPackStore
    private let pending: PendingSubjectSkipQueue
    private let onChanged: @MainActor () async -> Void

    init(
        reviewPack: ReviewPackStore = .shared,
        pending: PendingSubjectSkipQueue = .shared,
        onChanged: @escaping @MainActor () async -> Void = TodaySubjectsModel.refreshDueQueue
    ) {
        self.reviewPack = reviewPack
        self.pending = pending
        self.onChanged = onChanged
    }

    var totalRemaining: Int {
        let sum = subjects.filter { !$0.isSkipped }.reduce(unsortedToday) { $0 + $1.todayCount }

        return reviewsRemainingToday.map { min(sum, $0) } ?? sum
    }

    func load() async {
        await pending.flush()

        async let subjectsTask = Self.fetchSubjects()

        do {
            let counts = try await APIClient.subjectReviewDueCounts()
            let list = (try? await subjectsTask) ?? []

            apply(counts: counts, subjects: list)
            loadFailed = false
            hasLoaded = true
        } catch is CancellationError {
            return
        } catch let error as URLError where error.code == .cancelled {
            return
        } catch {
            loadFailed = !hasLoaded
        }
    }

    static func refreshDueQueue() async {
        await ReviewPackSync.shared.refresh(.skipChanged)
        await DueBadge.refresh()
    }

    func refresh() async {
        cards = [:]
        await load()

        for id in expanded { await loadCards(for: id) }
    }

    func toggleExpanded(_ id: String) {
        if expanded.contains(id) {
            expanded.remove(id)
        } else {
            expanded.insert(id)
            Task { await loadCards(for: id) }
        }
    }

    func loadCards(for id: String) async {
        if case .loaded = cards[id] { return }

        cards[id] = .loading

        do {
            let response = try await APIClient.reviewCards(
                limit: Self.cardLimit,
                tz: TimeZone.current.identifier,
                subjectId: id
            )

            cards[id] = .loaded(response.cards.map { TodaySubjectCard(id: $0.variantId, front: $0.face.front) })
        } catch is CancellationError {
            cards[id] = nil
        } catch let error as URLError where error.code == .cancelled {
            cards[id] = nil
        } catch {
            cards[id] = .failed
        }
    }

    func setSkipped(_ id: String, skipped: Bool) async {
        guard let index = subjects.firstIndex(where: { $0.id == id }), subjects[index].isSkipped != skipped else { return }

        let before = subjects
        let affected = [id] + descendants(of: id)
        let dayKey = LocalDayKey.today()

        toggleError = nil
        mark(affected, skipped: skipped)

        do {
            let result = skipped
                ? try await APIClient.skipSubjectForDay(id, tz: TimeZone.current.identifier)
                : try await APIClient.unskipSubjectForDay(id, tz: TimeZone.current.identifier)

            await reviewPack.setSkipped(result.subjectIds, skipped: true, dayKey: result.dayKey)
            await reviewPack.setSkipped(affected.filter { !result.subjectIds.contains($0) }, skipped: false, dayKey: result.dayKey)
        } catch is URLError {
            await reviewPack.setSkipped(affected, skipped: skipped, dayKey: dayKey)
            pending.record(affected, skipped: skipped, dayKey: dayKey)
        } catch {
            subjects = before
            toggleError = skipped ? "Couldn't skip this subject. Try again." : "Couldn't restore this subject. Try again."

            return
        }

        await refreshAfterToggle()
    }

    private func refreshAfterToggle() async {
        changeCount += 1
        await load()
        await onChanged()
    }

    private func mark(_ ids: [String], skipped: Bool) {
        let ids = Set(ids)

        subjects = subjects.map { ids.contains($0.id) ? TodaySubject(id: $0.id, name: $0.name, todayCount: $0.todayCount, isSkipped: skipped) : $0 }
    }

    private func descendants(of id: String) -> [String] {
        var result: [String] = []
        var queue = childrenByParent[id] ?? []

        while let next = queue.popLast() {
            guard !result.contains(next) else { continue }

            result.append(next)
            queue.append(contentsOf: childrenByParent[next] ?? [])
        }

        return result
    }

    private func apply(counts: SubjectReviewDueCounts, subjects list: [Subject]) {
        let known = Set(list.map(\.id))
        let names = Dictionary(list.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
        let roots = Set(list.filter { subject in subject.parentId.map { !known.contains($0) || $0 == subject.id } ?? true }.map(\.id))

        childrenByParent = Dictionary(grouping: list.compactMap { subject in subject.parentId.map { ($0, subject.id) } }, by: \.0)
            .mapValues { $0.map(\.1) }
        subjects = counts.subjects
            .filter { $0.todayCount > 0 && roots.contains($0.subjectId) }
            .map { TodaySubject(id: $0.subjectId, name: names[$0.subjectId] ?? "Subject", todayCount: $0.todayCount, isSkipped: $0.skipped) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        unsortedToday = counts.unsorted.todayCount
        reviewsRemainingToday = counts.reviewsRemainingToday
    }

    private static func fetchSubjects() async throws -> [Subject] {
        try await APIClient.listSubjects()
    }
}
