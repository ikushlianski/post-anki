import Foundation
import Testing

@MainActor
private final class FakeDictator: SpeechDictating {
    var isSupported = true
    var onText: (@MainActor (String) -> Void)?
    var onFinish: (@MainActor (DictationFailure?) -> Void)?
    var cancelled = false
    var failure: DictationFailure?

    func start(
        onText: @escaping @MainActor (String) -> Void,
        onFinish: @escaping @MainActor (DictationFailure?) -> Void
    ) async {
        if let failure { return onFinish(failure) }

        self.onText = onText
        self.onFinish = onFinish
    }

    func stop() { onFinish?(nil) }
    func cancel() { cancelled = true }
}

@MainActor
private final class FakeSpeaker: SpeechSpeaking {
    var isSupported = true
    var spoken: [String] = []
    var stops = 0
    var finish: (@MainActor () -> Void)?

    func speak(_ text: String, onFinish: @escaping @MainActor () -> Void) {
        spoken.append(text)
        finish = onFinish
    }

    func stop() { stops += 1 }
}

@MainActor
private final class AuthorizationGate {
    var waiters: [CheckedContinuation<Bool, Never>] = []
    var launches = 0

    func wait() async -> Bool {
        await withCheckedContinuation { waiters.append($0) }
    }

    func resolve(_ allowed: Bool) {
        let pending = waiters

        waiters = []
        pending.forEach { $0.resume(returning: allowed) }
    }

    func dictator() -> SystemSpeechDictator {
        SystemSpeechDictator(hooks: SpeechDictatorHooks(
            isAvailable: { true },
            authorize: { await self.wait() },
            launch: { _, _ in self.launches += 1 }
        ))
    }
}

extension SmokeTests {
    @MainActor
    @Suite("Voice in chat")
    struct VoiceChatSmokeTests {
        private func defaults() -> UserDefaults {
            let suite = "voice-chat-\(UUID().uuidString)"

            return UserDefaults(suiteName: suite) ?? .standard
        }

        @Test("should fill the draft with dictated words and never send on its own")
        func dictationFillsDraft() async {
            let dictator = FakeDictator()
            let model = DictationModel(dictator: dictator)
            var draft = "Explain"

            await model.toggle(draft: draft) { draft = $0 }
            dictator.onText?("how closures work")

            #expect(draft == "Explain how closures work")
            #expect(model.isListening)
        }

        @Test("should stop listening when dictation ends")
        func dictationStops() async {
            let dictator = FakeDictator()
            let model = DictationModel(dictator: dictator)

            await model.toggle(draft: "") { _ in }
            await model.toggle(draft: "") { _ in }

            #expect(!model.isListening)
        }

        @Test("should explain and block the mic when permission is denied")
        func permissionDenied() async {
            let dictator = FakeDictator()
            dictator.failure = .permissionDenied
            let model = DictationModel(dictator: dictator)

            await model.toggle(draft: "") { _ in }

            #expect(model.message?.contains("Allow it in Settings") == true)
            #expect(model.isBlocked)
            #expect(!model.isListening)
        }

        @Test("should abort dictation when the draft is cleared by sending")
        func clearedDraftCancels() async {
            let dictator = FakeDictator()
            let model = DictationModel(dictator: dictator)
            var draft = ""

            await model.toggle(draft: draft) { draft = $0 }
            dictator.onText?("hello")
            model.draftChanged(to: "")

            #expect(dictator.cancelled)
            #expect(!model.isListening)
        }

        @Test("should hide the mic when speech recognition is unsupported")
        func unsupported() {
            let dictator = FakeDictator()
            dictator.isSupported = false

            #expect(!DictationModel(dictator: dictator).isSupported)
        }

        @Test("should read a finished reply with markdown stripped only when enabled")
        func readsWhenEnabled() {
            let speaker = FakeSpeaker()
            let model = ReadAloudModel(speaker: speaker, defaults: defaults())

            model.replyFinished("Hello")
            #expect(speaker.spoken.isEmpty)

            model.isEnabled = true
            model.replyFinished("It is **{{c1::Paris}}**")

            #expect(speaker.spoken == ["It is Paris"])
            #expect(model.isSpeaking)
        }

        @Test("should remember the read-aloud choice on this device")
        func persists() {
            let store = defaults()

            ReadAloudModel(speaker: FakeSpeaker(), defaults: store).isEnabled = true

            #expect(ReadAloudModel(speaker: FakeSpeaker(), defaults: store).isEnabled)
        }

        @Test("should stop speaking when turned off")
        func stopsWhenDisabled() {
            let speaker = FakeSpeaker()
            let model = ReadAloudModel(speaker: speaker, defaults: defaults())

            model.isEnabled = true
            model.replyFinished("Hi")
            model.isEnabled = false

            #expect(speaker.stops > 0)
            #expect(!model.isSpeaking)
        }

        @Test("should not open the microphone when dictation is stopped during the permission prompt")
        func stopDuringPrompt() async {
            let gate = AuthorizationGate()
            let dictator = gate.dictator()
            let model = DictationModel(dictator: dictator)

            let starting = Task { await model.toggle(draft: "") { _ in } }
            await Task.yield()
            await model.toggle(draft: "") { _ in }
            gate.resolve(true)
            await starting.value

            #expect(gate.launches == 0)
            #expect(!model.isListening)
        }

        @Test("should not open the microphone when dictation is cancelled during the permission prompt")
        func cancelDuringPrompt() async {
            let gate = AuthorizationGate()
            let model = DictationModel(dictator: gate.dictator())

            let starting = Task { await model.toggle(draft: "") { _ in } }
            await Task.yield()
            model.cancel()
            gate.resolve(true)
            await starting.value

            #expect(gate.launches == 0)
            #expect(!model.isListening)
        }

        @Test("should run only the latest of two overlapping starts")
        func overlappingStarts() async {
            let gate = AuthorizationGate()
            let dictator = gate.dictator()

            let first = Task { await dictator.start(onText: { _ in }, onFinish: { _ in }) }
            await Task.yield()
            let second = Task { await dictator.start(onText: { _ in }, onFinish: { _ in }) }
            await Task.yield()
            gate.resolve(true)
            await first.value
            await second.value

            #expect(gate.launches == 1)
        }
    }
}
