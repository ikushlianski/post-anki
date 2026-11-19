import Foundation

enum DictationFailure: Error, Equatable {
    case permissionDenied
    case unavailable
    case interrupted

    var message: String {
        switch self {
        case .permissionDenied:
            "Microphone or speech recognition is off. Allow it in Settings to dictate."
        case .unavailable:
            "Voice input isn't available right now."
        case .interrupted:
            "Voice input stopped unexpectedly."
        }
    }
}

@MainActor
protocol SpeechDictating: AnyObject {
    var isSupported: Bool { get }

    func start(
        onText: @escaping @MainActor (String) -> Void,
        onFinish: @escaping @MainActor (DictationFailure?) -> Void
    ) async

    func stop()
    func cancel()
}
