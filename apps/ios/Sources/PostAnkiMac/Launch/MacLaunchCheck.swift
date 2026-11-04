import Foundation
import Observation
import PostAnkiAPI
import SwiftUI

enum MacLaunchIssue: Equatable {
    case noToken
    case signedOut
    case offline
    case serverUnreachable
    case serverError

    var message: String {
        switch self {
        case .noToken: return "Sign in from Settings to load your data."
        case .signedOut: return "The server rejected your access token. Check it in Settings."
        case .offline: return "You're offline."
        case .serverUnreachable: return "Can't reach the server."
        case .serverError: return "The server ran into a problem. Try again later."
        }
    }

    var showsAddress: Bool {
        self == .offline || self == .serverUnreachable
    }

    static func classify(_ error: Error) -> MacLaunchIssue? {
        if error is CancellationError { return nil }

        if let urlError = error as? URLError {
            switch urlError.code {
            case .cancelled: return nil
            case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed: return .offline
            default: return .serverUnreachable
            }
        }

        if case APIError.unauthorized = error { return .signedOut }

        if case APIError.badURL = error { return .serverUnreachable }

        return .serverError
    }
}

@Observable
@MainActor
final class MacLaunchCheck {
    private(set) var issue: MacLaunchIssue?
    private(set) var address = APIClient.baseURLString
    var isDismissed = false

    private var task: Task<Void, Never>?

    static func applyDevAddress() {
        #if DEBUG
        let value = Bundle.main.object(forInfoDictionaryKey: "PostAnkiDevAPIURL") as? String
        APIClient.setFallbackBaseURL(value)

        if let seed = DevTokenSeed.seedToken(saved: TokenStore.read(), baked: Self.bakedDevToken) {
            try? TokenStore.save(seed)
        }
        #endif
    }

    private static var bakedDevToken: String {
        #if DEBUG
        (Bundle.main.object(forInfoDictionaryKey: "PostAnkiDevAPIToken") as? String) ?? ""
        #else
        ""
        #endif
    }

    func run() {
        task?.cancel()
        address = APIClient.baseURLString

        guard TokenStore.read() != nil else {
            issue = .noToken
            isDismissed = false
            return
        }

        task = Task {
            var retried = false

            while true {
                do {
                    _ = try await APIClient.streak()
                    issue = nil

                    return
                } catch {
                    guard let found = MacLaunchIssue.classify(error) else { return }

                    if found == .signedOut, !retried,
                       let baked = DevTokenSeed.retryToken(rejected: TokenStore.read(), baked: Self.bakedDevToken),
                       (try? TokenStore.save(baked)) != nil {
                        retried = true

                        continue
                    }

                    if found != issue { isDismissed = false }

                    issue = found

                    return
                }
            }
        }
    }
}

struct MacLaunchBanner: View {
    let check: MacLaunchCheck

    @Environment(\.macOpenSettings) private var openSettings

    var body: some View {
        if let issue = check.issue, !check.isDismissed {
            ZoomHStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                    .accessibilityHidden(true)

                ZoomVStack(alignment: .leading, spacing: 2) {
                    Text(issue.message)

                    if issue.showsAddress {
                        Text(check.address)
                            .zoomFont(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                Button("Settings") { openSettings() }

                Button {
                    check.isDismissed = true
                } label: {
                    Image(systemName: "xmark")
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Dismiss")
                .help("Dismiss")
            }
            .zoomPadding(10)
            .background(.bar)
        }
    }
}
