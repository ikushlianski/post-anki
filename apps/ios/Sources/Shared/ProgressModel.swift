import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class ProgressModel {
    var milestones: [Milestone] = []
    var retention: RetentionReport?
    var digest: WeeklyDigest?
    var hasLoaded = false
    var isLoading = false
    var failure: ProgressLoadError?
    var sectionFailure: ProgressLoadError?

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        defer { isLoading = false }

        async let milestonesResult = Self.fetch { try await APIClient.milestones() }
        async let retentionResult = Self.fetch { try await APIClient.retentionReport() }
        async let digestResult = Self.fetch { try await APIClient.weeklyDigest() }
        let (milestonesOutcome, retentionOutcome, digestOutcome) =
            await (milestonesResult, retentionResult, digestResult)

        var errors: [Error] = []

        switch milestonesOutcome {
        case .success(let value): milestones = value.sorted { $0.achievedAt > $1.achievedAt }
        case .failure(let error): errors.append(error)
        }

        switch retentionOutcome {
        case .success(let value): retention = value
        case .failure(let error): errors.append(error)
        }

        switch digestOutcome {
        case .success(let value): digest = value
        case .failure(let error): errors.append(error)
        }

        let mapped = errors.compactMap { ProgressLoadError.from($0) }

        if errors.count == 3 && !hasLoaded {
            failure = mapped.first
        } else {
            failure = nil
            hasLoaded = hasLoaded || errors.count < 3
            sectionFailure = mapped.first
        }
    }

    private static func fetch<T: Sendable>(_ call: @Sendable () async throws -> T) async -> Result<T, Error> {
        do { return .success(try await call()) } catch { return .failure(error) }
    }
}
