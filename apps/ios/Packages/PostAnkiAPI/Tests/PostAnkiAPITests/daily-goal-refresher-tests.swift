import Foundation
import Testing
@testable import PostAnkiAPI

private struct Down: Error {}

private actor Gate {
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private var isOpen = false

    func wait() async {
        if isOpen { return }

        await withCheckedContinuation { waiters.append($0) }
    }

    func open() {
        isOpen = true
        waiters.forEach { $0.resume() }
        waiters = []
    }
}

private actor Script {
    private var goals: [Result<DailyGoalProgress, Down>]
    private var streaks: [Result<GoalStreak, Down>]
    private var gates: [Gate?]
    private var calls = 0

    init(goals: [Result<DailyGoalProgress, Down>], streaks: [Result<GoalStreak, Down>], gates: [Gate?] = []) {
        self.goals = goals
        self.streaks = streaks
        self.gates = gates
    }

    func nextGoal() async throws -> DailyGoalProgress {
        let index = calls
        calls += 1

        if index < gates.count, let gate = gates[index] { await gate.wait() }

        return try goals[index].get()
    }

    func nextStreak(index: Int) throws -> GoalStreak {
        try streaks[index].get()
    }
}

private func goal(_ done: Int) -> DailyGoalProgress {
    DailyGoalProgress(target: 10, doneToday: done, dayEndsAt: "2026-01-01T00:00:00Z")
}

private func streak(_ current: Int) -> GoalStreak {
    GoalStreak(status: "active", current: current, longest: current)
}

@MainActor
private func refresher(_ script: Script, streakResults: [Result<GoalStreak, Down>]) -> DailyGoalRefresher {
    let counter = Counter()

    return DailyGoalRefresher(
        fetchGoal: { try await script.nextGoal() },
        fetchStreak: {
            let index = counter.next()

            return try streakResults[index].get()
        }
    )
}

private final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0

    func next() -> Int {
        lock.lock()
        defer { lock.unlock() }
        value += 1

        return value - 1
    }
}

@MainActor
@Suite struct DailyGoalRefresherTests {
    @Test func successReturnsGoalAndStreak() async {
        let script = Script(goals: [.success(goal(3))], streaks: [])
        let sut = refresher(script, streakResults: [.success(streak(4))])

        let snapshot = await sut.refresh()

        #expect(snapshot == DailyGoalSnapshot(goal: goal(3), streak: streak(4)))
    }

    @Test func olderRefreshResolvingAfterNewerOneIsDropped() async {
        let gate = Gate()
        let script = Script(goals: [.success(goal(1)), .success(goal(2))], streaks: [], gates: [gate, nil])
        let sut = refresher(script, streakResults: [.success(streak(1)), .success(streak(2))])

        let older = Task { await sut.refresh() }
        await Task.yield()
        try? await Task.sleep(for: .milliseconds(50))

        let newer = await sut.refresh()
        await gate.open()
        let olderResult = await older.value

        #expect(newer == DailyGoalSnapshot(goal: goal(2), streak: streak(2)))
        #expect(olderResult == nil)
    }

    @Test func failureOnFirstLoadYieldsEmptySnapshot() async {
        let script = Script(goals: [.failure(Down())], streaks: [])
        let sut = refresher(script, streakResults: [.failure(Down())])

        let snapshot = await sut.refresh()

        #expect(snapshot == DailyGoalSnapshot(goal: nil, streak: nil))
    }

    @Test func failureOnlyBlanksTheFailingPart() async {
        let script = Script(goals: [.success(goal(5))], streaks: [])
        let sut = refresher(script, streakResults: [.failure(Down())])

        let snapshot = await sut.refresh()

        #expect(snapshot == DailyGoalSnapshot(goal: goal(5), streak: nil))
    }

    @Test func latestRefreshWinsAfterEarlierSuccess() async {
        let script = Script(goals: [.success(goal(1)), .failure(Down())], streaks: [])
        let sut = refresher(script, streakResults: [.success(streak(1)), .failure(Down())])

        let first = await sut.refresh()
        let second = await sut.refresh()

        #expect(first?.goal == goal(1))
        #expect(second == DailyGoalSnapshot(goal: nil, streak: nil))
    }
}
