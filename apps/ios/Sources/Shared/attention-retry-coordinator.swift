import Observation
import PostAnkiAPI

enum AttentionRetryPhase: Equatable {
    case starting
    case running
    case failed(String)
}

enum AttentionRetryStatus: Equatable, Sendable {
    case running
    case done
    case failed(reason: String?)
}

struct AttentionRetryGateway: Sendable {
    var start: @Sendable (_ sourceId: String, _ text: String?) async throws -> Void
    var status: @Sendable (_ sourceId: String) async throws -> AttentionRetryStatus
    var sleep: @Sendable () async -> Void

    static let live = AttentionRetryGateway(
        start: { id, text in
            do {
                _ = try await APIClient.regenerateKnowledgeSource(id: id, text: text)
            } catch APIError.badStatus(409, _) {
                return
            }
        },
        status: { id in
            let result = try await APIClient.knowledgeSourceRegeneration(id: id)

            switch result.status {
            case "done": return .done
            case "failed": return .failed(reason: result.failureReason)
            default: return .running
            }
        },
        sleep: { try? await Task.sleep(for: .seconds(3)) }
    )
}

@Observable
@MainActor
final class AttentionRetryCoordinator {
    static let maxConcurrent = 3
    static let maxPolls = 100
    static let timedOutMessage = "Still working. Check back in a few minutes."

    private(set) var phases: [String: AttentionRetryPhase] = [:]
    private(set) var batchMessage: String?

    @ObservationIgnored private let gateway: AttentionRetryGateway
    @ObservationIgnored private let onFinished: @MainActor () async -> Void

    init(gateway: AttentionRetryGateway = .live, onFinished: @escaping @MainActor () async -> Void = {}) {
        self.gateway = gateway
        self.onFinished = onFinished
    }

    func isBusy(_ id: String) -> Bool {
        phases[id] == .starting || phases[id] == .running
    }

    func retry(_ id: String, text: String? = nil) async {
        batchMessage = nil

        guard await run(id, text: text) else { return }

        await onFinished()
    }

    func retryAll(_ ids: [String]) async {
        let queue = ids.filter { !isBusy($0) }

        guard !queue.isEmpty else { return }

        batchMessage = nil

        var notStarted = 0
        var reachedServer = false

        await withTaskGroup(of: Bool.self) { group in
            var next = queue.makeIterator()
            var active = 0

            func launch() {
                guard let id = next.next() else { return }

                active += 1
                group.addTask { await self.run(id, text: nil) }
            }

            for _ in 0..<min(Self.maxConcurrent, queue.count) { launch() }

            while active > 0, let started = await group.next() {
                active -= 1

                if started { reachedServer = true } else { notStarted += 1 }

                launch()
            }
        }

        if notStarted > 0 {
            batchMessage = "\(notStarted) of \(queue.count) could not start. Try again."
        }

        if reachedServer { await onFinished() }
    }

    private func run(_ id: String, text: String?) async -> Bool {
        guard !isBusy(id) else { return false }

        phases[id] = .starting

        do {
            try await gateway.start(id, text)
        } catch {
            phases[id] = .failed(Self.startMessage(for: error))

            return false
        }

        phases[id] = .running

        for _ in 0..<Self.maxPolls {
            await gateway.sleep()

            guard let status = try? await gateway.status(id) else { continue }

            switch status {
            case .done:
                phases[id] = nil

                return true
            case .failed(let reason):
                phases[id] = .failed(AttentionWording.text(kind: .failed, reason: reason))

                return true
            case .running:
                continue
            }
        }

        phases[id] = .failed(Self.timedOutMessage)

        return true
    }

    private static func startMessage(for error: Error) -> String {
        if case APIError.badStatus(422, _) = error {
            return "This note has no saved text to retry. Use Edit text and retry."
        }

        return StudyToolsError.message(for: error, notFound: "This note no longer exists.")
    }
}
