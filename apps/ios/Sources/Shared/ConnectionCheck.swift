import Foundation
import PostAnkiAPI

#if canImport(AppKit)
import AppKit
#elseif canImport(UIKit)
import UIKit
#endif

enum ConnectionResult: Equatable {
    case signedIn
    case reachableNotSignedIn
    case rejectedToken
    case offline
    case unreachable
    case secureConnectionFailed
    case timedOut
    case serverError(Int?)
    case failed

    var message: String {
        switch self {
        case .signedIn: return "Reachable and signed in."
        case .reachableNotSignedIn: return "Server reachable, but no access token is saved."
        case .rejectedToken: return "Server reachable, but it rejected your access token."
        case .offline: return "You're offline."
        case .unreachable: return "Can't reach the server at this address."
        case .secureConnectionFailed: return "Can't make a secure connection: the server's certificate or TLS setup isn't trusted."
        case .timedOut: return "The server didn't answer in time."
        case .serverError(let status?): return "Server reachable, but it answered with error \(status)."
        case .serverError(nil): return "Server reachable, but it ran into a problem."
        case .failed: return "The server's reply couldn't be read."
        }
    }

    var isSuccess: Bool { self == .signedIn }

    static func classify(_ error: Error) -> ConnectionResult? {
        if error is CancellationError { return nil }

        if let urlError = error as? URLError {
            switch urlError.code {
            case .cancelled: return nil
            case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed: return .offline
            case .timedOut: return .timedOut
            case .secureConnectionFailed,
                 .serverCertificateUntrusted,
                 .serverCertificateHasBadDate,
                 .serverCertificateNotYetValid,
                 .serverCertificateHasUnknownRoot,
                 .clientCertificateRejected,
                 .clientCertificateRequired,
                 .appTransportSecurityRequiresSecureConnection: return .secureConnectionFailed
            default: return .unreachable
            }
        }

        if case APIError.unauthorized = error { return .rejectedToken }

        if case APIError.badURL = error { return .unreachable }

        if case APIError.badStatus(let status, _) = error { return .serverError(status) }

        if error is DecodingError { return .failed }

        return .serverError(nil)
    }

    static func run(hasToken: Bool, baseURL: String? = nil) async -> ConnectionResult? {
        do {
            _ = try await APIClient.streak(baseURL: baseURL)

            return hasToken ? .signedIn : .reachableNotSignedIn
        } catch {
            if !hasToken, case APIError.unauthorized = error { return .reachableNotSignedIn }

            return classify(error)
        }
    }
}

enum Diagnostics {
    static func report(failures: [RequestFailure], hasToken: Bool, bundle: Bundle = .main) -> String {
        let info = bundle.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "unknown"
        let build = info?["CFBundleVersion"] as? String ?? "unknown"

        var lines = [
            "App version: \(version) (\(build))",
            "Server address: \(APIClient.baseURLString)",
            "Signed in: \(hasToken ? "yes" : "no")",
            "Recent failures: \(failures.count)"
        ]

        lines.append(contentsOf: failures.map(\.line))

        return lines.joined(separator: "\n")
    }

    @MainActor
    static func copy(_ text: String) {
        #if canImport(AppKit)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #elseif canImport(UIKit)
        UIPasteboard.general.string = text
        #endif
    }
}
