import PostAnkiAPI
import SwiftUI

enum ChatQueueSearchState: Equatable {
    case idle
    case loading
    case failed(String)
    case ready([ChatQueueSearchHit], isCut: Bool)
}

@Observable
@MainActor
final class ChatQueueSearchModel {
    static let debounce: Duration = .milliseconds(300)

    var query = ""
    private(set) var state: ChatQueueSearchState = .idle

    var term: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }
    var isActive: Bool { term.count >= ChatQueueSearchLimits.minChars }

    func run() async {
        guard isActive else {
            state = .idle

            return
        }

        let current = term

        state = .loading

        do {
            try await Task.sleep(for: Self.debounce)

            let response = try await APIClient.searchChatQueueResponse(q: current)

            guard !Task.isCancelled, current == term else { return }

            state = .ready(response.results, isCut: response.isCut)
        } catch is CancellationError {
            return
        } catch let error as URLError where error.code == .cancelled {
            return
        } catch {
            guard !Task.isCancelled, current == term else { return }

            state = .failed(ChatQueueFailure.failure(for: error).message)
        }
    }
}
