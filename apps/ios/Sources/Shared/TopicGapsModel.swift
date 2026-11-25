import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class TopicGapsModel {
    let topicId: String
    var gaps: [Gap] = []
    var busyIds: Set<String> = []
    let writes = SerialWriteQueue()
    var isLoading = false
    var hasLoaded = false
    var notice: String?
    var errorMessage: String?

    init(topicId: String) {
        self.topicId = topicId
    }

    var open: [Gap] {
        gaps.filter { $0.state == "open" && !Self.isLater($0) && $0.triageState != "dismissed" }.sorted {
            let lhs = ($0.triageState == "important" ? 0 : 1, $0.wanted ? 0 : 1, $0.label)
            let rhs = ($1.triageState == "important" ? 0 : 1, $1.wanted ? 0 : 1, $1.label)

            return lhs < rhs
        }
    }

    var later: [Gap] { gaps.filter { $0.state == "open" && Self.isLater($0) } }
    var dismissed: [Gap] { gaps.filter { $0.state == "open" && $0.triageState == "dismissed" } }
    var closed: [Gap] { gaps.filter { $0.state != "open" } }

    private static func isLater(_ gap: Gap) -> Bool {
        gap.triageState == "user_deferred" || gap.triageState == "auto_deferred"
    }

    func load() async {
        isLoading = true
        errorMessage = nil

        do {
            gaps = try await APIClient.topicGaps(topicId: topicId)
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            isLoading = false

            return
        } catch {
            errorMessage = StudyToolsError.message(for: error, notFound: "This topic was removed.")
        }

        isLoading = false
    }

    func add(label: String, concern: String?, wanted: Bool) async -> Bool {
        do {
            let created = try await APIClient.declareGap(
                DeclareGapInput(topicId: topicId, label: label, wanted: wanted, concern: concern)
            )
            gaps.append(created)

            return true
        } catch {
            errorMessage = GapError.message(for: error)

            return false
        }
    }

    func settle() async { await writes.settle() }

    func setWanted(_ gap: Gap, _ wanted: Bool) async {
        await mutate(gap, locally: { $0.wanted = wanted }) { [self] in
            replace(try await APIClient.curateGap(id: gap.id, CurateGapInput(wanted: wanted)))
        }
    }

    func setState(_ gap: Gap, _ state: String) async {
        await mutate(gap, locally: { $0.state = state }) { [self] in
            replace(try await APIClient.curateGap(id: gap.id, CurateGapInput(state: state)))
        }
    }

    func triage(_ gap: Gap, action: String) async {
        await mutate(gap, locally: { $0.triageState = Self.triageState(after: action, from: $0.triageState) }) { [self] in
            let result = try await APIClient.triageGap(id: gap.id, action: action)
            replace(result.gap)
            notice = result.changed ? nil : "No change."
        }
    }

    private static func triageState(after action: String, from current: String) -> String {
        switch action {
        case "important": "important"
        case "defer": "user_deferred"
        case "dismiss": "dismissed"
        case "revisit": "untriaged"
        default: current
        }
    }

    private func mutate(_ gap: Gap, locally: (inout Gap) -> Void, _ work: @escaping @MainActor () async throws -> Void) async {
        guard !busyIds.contains(gap.id), let index = gaps.firstIndex(where: { $0.id == gap.id }) else { return }

        let before = gaps[index]

        busyIds.insert(gap.id)
        errorMessage = nil
        notice = nil
        locally(&gaps[index])

        writes.enqueue { [self] in
            defer { busyIds.remove(gap.id) }

            do {
                try await work()
            } catch {
                if case APIError.badStatus(404, _) = error {
                    gaps.removeAll { $0.id == gap.id }
                } else if let current = gaps.firstIndex(where: { $0.id == gap.id }) {
                    gaps[current] = before
                }

                errorMessage = GapError.message(for: error)
            }
        }
    }

    private func replace(_ gap: Gap) {
        if let index = gaps.firstIndex(where: { $0.id == gap.id }) {
            gaps[index] = gap
        }
    }
}

enum GapTriageAction: String, CaseIterable {
    case important
    case later = "defer"
    case dismiss
    case revisit

    var title: String {
        switch self {
        case .important: "Important"
        case .later: "Later (60 days)"
        case .dismiss: "Dismiss"
        case .revisit: "Revisit"
        }
    }

    static func available(for gap: Gap) -> [GapTriageAction] {
        let state = gap.triageState

        return allCases.filter {
            switch $0 {
            case .important: state != "important"
            case .later: state != "user_deferred"
            case .dismiss: state != "dismissed"
            case .revisit: state == "dismissed" || state == "user_deferred" || state == "auto_deferred"
            }
        }
    }
}
