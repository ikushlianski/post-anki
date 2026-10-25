#if os(macOS)
import PostAnkiAPI
import SwiftUI

extension ProgressLoadError {
    var macTitle: String {
        switch self {
        case .offline: return "Couldn't connect"
        case .unauthorized: return "Add your access token"
        case .notFound: return "Not found"
        case .other: return "Something went wrong"
        }
    }

    var macSymbol: String {
        switch self {
        case .offline: return "wifi.slash"
        case .unauthorized: return "key"
        case .notFound: return "questionmark.folder"
        case .other: return "exclamationmark.triangle"
        }
    }

    var macDetail: String {
        switch self {
        case .offline: return "Check your connection and the server address in Settings, then try again."
        case .unauthorized: return "Open Settings and paste your access token."
        case .notFound: return "This item no longer exists."
        case .other: return "Couldn't load this screen. Try again."
        }
    }
}

struct MacLoadStateView: View {
    let failure: ProgressLoadError
    var detail: String?
    let onRetry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label(failure.macTitle, systemImage: failure.macSymbol)
        } description: {
            Text(detail ?? failure.macDetail)
        } actions: {
            if failure == .unauthorized {
                SettingsLink { Text("Open Settings") }
            }

            Button("Try again", action: onRetry)
        }
    }
}

struct MacEmptyStateView: View {
    let title: String
    let systemImage: String
    let message: String

    var body: some View {
        ContentUnavailableView(title, systemImage: systemImage, description: Text(message))
    }
}
#endif
