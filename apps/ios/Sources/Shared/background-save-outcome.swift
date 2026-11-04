import Foundation
import PostAnkiAPI

struct SaveFailure: Sendable, Equatable {
    let id: String
    let bitId: String
    var title: String?
    let message: String
}

struct BackgroundSaveExhausted: Error {
    let last: Error
}

enum BackgroundSaveOutcome: Sendable, Equatable {
    case sent
    case stale
    case offline
    case transient
    case failed(message: String)

    static let maxTries = 3

    static func classify(_ error: Error) -> BackgroundSaveOutcome {
        if error is URLError || error is CancellationError {
            return .offline
        }

        if let exhausted = error as? BackgroundSaveExhausted {
            return .failed(message: failureMessage(exhausted.last))
        }

        guard let apiError = error as? APIError else {
            return .failed(message: failureMessage(error))
        }

        switch apiError {
        case .unauthorized:
            return .offline
        case .badURL:
            return .failed(message: failureMessage(error))
        case .badStatus(let status, let code):
            if status == 404 || (status == 409 && code == "blocked") || (status == 403 && code == "not_approved") {
                return .stale
            }

            if status >= 500 || status == 408 || status == 429 {
                return .transient
            }

            return .failed(message: failureMessage(error))
        }
    }

    static func send<T>(retryDelay: Duration, _ operation: () async throws -> T) async throws -> T {
        var tries = 0

        while true {
            do {
                return try await operation()
            } catch {
                guard classify(error) == .transient else { throw error }

                tries += 1

                if tries >= maxTries { throw BackgroundSaveExhausted(last: error) }

                try await Task.sleep(for: retryDelay)
            }
        }
    }

    static func failureMessage(_ error: Error) -> String {
        if let exhausted = error as? BackgroundSaveExhausted {
            return failureMessage(exhausted.last)
        }

        if case APIError.badStatus(let status, let code) = error {
            if code == "no_variant" { return "This item has no questions yet, so it can't be approved." }

            if code == "variant_not_active" { return "One of those questions changed. Reload to see the current ones." }

            if status >= 500 { return "The server isn't answering properly right now (error \(status))." }

            return "The server refused this save (error \(status))."
        }

        return "The server couldn't accept this save."
    }
}
