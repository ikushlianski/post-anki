import Foundation

public enum ConnectionFailureMessage {
    public static let offline = "Couldn't connect to the server. Pull to refresh to try again."
    public static let unauthorized = "Your access token was rejected. Check Settings."

    public static func message(for error: Error, fallback: String) -> String {
        switch ProgressLoadError.from(error) {
        case .offline: offline
        case .unauthorized: unauthorized
        default: fallback
        }
    }
}
