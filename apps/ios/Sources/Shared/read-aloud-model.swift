import Foundation
import PostAnkiAPI

@Observable
@MainActor
final class ReadAloudModel {
    static let storageKey = "post-anki.read-replies-aloud"
    static let shared = ReadAloudModel()

    private(set) var isSpeaking = false
    var isEnabled: Bool {
        didSet {
            defaults.set(isEnabled, forKey: Self.storageKey)

            if !isEnabled { stop() }
        }
    }

    private let speaker: SpeechSpeaking
    private let defaults: UserDefaults
    private var generation = 0

    init(speaker: SpeechSpeaking? = nil, defaults: UserDefaults = .standard) {
        self.speaker = speaker ?? SystemSpeechSpeaker()
        self.defaults = defaults
        isEnabled = defaults.bool(forKey: Self.storageKey)
    }

    var isSupported: Bool { speaker.isSupported }

    func replyFinished(_ text: String) {
        guard isEnabled else { return }

        let spoken = SpeechTextCleaner.clean(text)

        guard !spoken.isEmpty else { return }

        generation += 1

        let current = generation

        isSpeaking = true
        speaker.speak(spoken) { [weak self] in
            guard let self, self.generation == current else { return }

            self.isSpeaking = false
        }
    }

    func stop() {
        generation += 1
        speaker.stop()
        isSpeaking = false
    }
}
