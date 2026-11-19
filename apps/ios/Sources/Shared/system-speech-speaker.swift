import AVFoundation
import Foundation

@MainActor
final class SystemSpeechSpeaker: NSObject, SpeechSpeaking, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private var onFinish: (@MainActor () -> Void)?
    private var current: ObjectIdentifier?

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    var isSupported: Bool { true }

    func speak(_ text: String, onFinish: @escaping @MainActor () -> Void) {
        synthesizer.stopSpeaking(at: .immediate)
        self.onFinish = onFinish
        Self.activateAudioSession()

        let utterance = AVSpeechUtterance(string: text)

        current = ObjectIdentifier(utterance)

        utterance.voice = AVSpeechSynthesisVoice(language: Locale.current.identifier.replacingOccurrences(of: "_", with: "-"))
            ?? AVSpeechSynthesisVoice(language: AVSpeechSynthesisVoice.currentLanguageCode())
        synthesizer.speak(utterance)
    }

    func stop() {
        onFinish = nil
        current = nil
        synthesizer.stopSpeaking(at: .immediate)
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)

        Task { @MainActor in self.finished(id) }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)

        Task { @MainActor in self.finished(id) }
    }

    private func finished(_ id: ObjectIdentifier) {
        guard id == current else { return }

        current = nil

        let callback = onFinish

        onFinish = nil
        callback?()
    }

    private static func activateAudioSession() {
        #if os(iOS)
        let session = AVAudioSession.sharedInstance()

        try? session.setCategory(.playback, mode: .spokenAudio)
        try? session.setActive(true)
        #endif
    }
}
