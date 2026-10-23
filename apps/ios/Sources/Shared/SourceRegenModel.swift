import PostAnkiAPI
import SwiftUI

enum SourceRegenPhase: Equatable {
    case idle
    case running(replaced: Int?)
    case done
    case failed(String)
    case timedOut
    case error(String)
}

@Observable
@MainActor
final class SourceRegenModel {
    let sourceId: String
    var phase: SourceRegenPhase = .idle

    private var pollTask: Task<Void, Never>?
    private let pollInterval: Duration = .seconds(3)
    private let maxPolls = 100

    init(sourceId: String) {
        self.sourceId = sourceId
    }

    func start(onFinished: @escaping () -> Void) async {
        guard pollTask == nil else { return }

        do {
            let result = try await APIClient.regenerateKnowledgeSource(id: sourceId)

            phase = .running(replaced: result.supersededCount)
            beginPolling(onFinished: onFinished)
        } catch APIError.badStatus(409, _) {
            phase = .running(replaced: nil)
            beginPolling(onFinished: onFinished)
        } catch APIError.badStatus(422, _) {
            phase = .error("This source has no saved text to extract from.")
        } catch {
            phase = .error(StudyToolsError.message(for: error, notFound: "This source no longer exists."))
        }
    }

    func stop() {
        pollTask?.cancel()
        pollTask = nil
    }

    private func beginPolling(onFinished: @escaping () -> Void) {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            guard let self else { return }

            for _ in 0..<maxPolls {
                try? await Task.sleep(for: pollInterval)

                guard !Task.isCancelled else { return }

                if let status = try? await APIClient.knowledgeSourceRegeneration(id: sourceId) {
                    if status.status == "done" {
                        phase = .done
                        pollTask = nil
                        onFinished()

                        return
                    }

                    if status.status == "failed" {
                        phase = .failed(status.failureReason ?? "unknown reason")
                        pollTask = nil

                        return
                    }
                }
            }

            phase = .timedOut
            pollTask = nil
        }
    }
}

@Observable
@MainActor
final class MoreVariantsModel {
    let bitId: String
    var isBusy = false
    var requested = false
    var errorMessage: String?

    init(bitId: String) {
        self.bitId = bitId
    }

    func request() async {
        guard !isBusy, !requested else { return }

        isBusy = true
        errorMessage = nil
        defer { isBusy = false }

        do {
            _ = try await APIClient.generateMoreVariants(bitId: bitId)
            requested = true
        } catch {
            errorMessage = StudyToolsError.message(for: error, notFound: "This item no longer exists.")
        }
    }
}
