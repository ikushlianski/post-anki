import PostAnkiAPI
import SwiftUI

enum DueTodayFailure: Equatable {
    case offline
    case unauthorized
    case other
}

@Observable
@MainActor
final class DueTodayModel {
    enum State: Equatable {
        case idle
        case loading
        case failed(DueTodayFailure)
    }

    var counts: ReviewCounts?
    var state: State = .idle

    var total: Int? {
        counts.map { $0.review + $0.learning + $0.new }
    }

    func load() async {
        if state == .loading { return }

        state = .loading

        await PendingGradeQueue.shared.flush()

        do {
            let response = try await APIClient.reviewCards(
                limit: 1,
                tz: TimeZone.current.identifier
            )
            counts = response.counts
            state = .idle
        } catch is CancellationError {
            state = .idle
        } catch let error as URLError where error.code == .cancelled {
            state = .idle
        } catch APIError.unauthorized {
            state = .failed(.unauthorized)
        } catch is URLError {
            state = .failed(.offline)
        } catch {
            state = .failed(.other)
        }
    }
}
