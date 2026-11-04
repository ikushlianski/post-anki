import Foundation

public enum AddSendFailure {
    public static let offline = "Couldn't connect to the server. Your text is still here, send it again in a moment."
    public static let unauthorized = "Add your access token in Settings, then send again."
    public static let other = "Couldn't send that — try again."

    public static func message(for error: Error) -> String {
        switch ProgressLoadError.from(error) {
        case .offline: offline
        case .unauthorized: unauthorized
        default: other
        }
    }
}
