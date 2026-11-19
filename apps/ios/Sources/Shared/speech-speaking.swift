import Foundation

@MainActor
protocol SpeechSpeaking: AnyObject {
    var isSupported: Bool { get }

    func speak(_ text: String, onFinish: @escaping @MainActor () -> Void)
    func stop()
}
