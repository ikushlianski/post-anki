import AVFoundation
import Foundation
import Speech

private final class RecognitionRequestBox: @unchecked Sendable {
    let request = SFSpeechAudioBufferRecognitionRequest()
}

struct SpeechDictatorHooks {
    var isAvailable: @MainActor () -> Bool
    var authorize: @MainActor () async -> Bool
    var launch: (@MainActor (
        _ onText: @escaping @MainActor (String) -> Void,
        _ onFinish: @escaping @MainActor (DictationFailure?) -> Void
    ) -> Void)?
}

@MainActor
final class SystemSpeechDictator: SpeechDictating {
    private let recognizer = SFSpeechRecognizer(locale: .current)
    private var engine: AVAudioEngine?
    private var box: RecognitionRequestBox?
    private var task: SFSpeechRecognitionTask?
    private var onFinish: (@MainActor (DictationFailure?) -> Void)?
    private var generation = 0
    private let hooks: SpeechDictatorHooks?

    init(hooks: SpeechDictatorHooks? = nil) {
        self.hooks = hooks
    }

    var isSupported: Bool { hooks?.isAvailable() ?? recognizer?.isAvailable ?? false }

    func start(
        onText: @escaping @MainActor (String) -> Void,
        onFinish: @escaping @MainActor (DictationFailure?) -> Void
    ) async {
        teardown()
        generation += 1

        let current = generation

        guard isSupported else { return onFinish(.unavailable) }

        let allowed: Bool

        if let hooks {
            allowed = await hooks.authorize()
        } else {
            allowed = await Self.authorize()
        }

        guard current == generation else { return onFinish(nil) }
        guard allowed else { return onFinish(.permissionDenied) }

        if let launch = hooks?.launch { return launch(onText, onFinish) }

        begin(onText: onText, onFinish: onFinish)
    }

    private func begin(
        onText: @escaping @MainActor (String) -> Void,
        onFinish: @escaping @MainActor (DictationFailure?) -> Void
    ) {
        guard let recognizer else { return onFinish(.unavailable) }

        let box = RecognitionRequestBox()
        let engine = AVAudioEngine()

        box.request.shouldReportPartialResults = true
        box.request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition

        do {
            try Self.activateAudioSession()
            Self.installTap(on: engine, box: box)
            engine.prepare()
            try engine.start()
        } catch {
            engine.inputNode.removeTap(onBus: 0)
            Self.deactivateAudioSession()

            return onFinish(.unavailable)
        }

        self.engine = engine
        self.box = box
        self.onFinish = onFinish
        task = Self.recognize(with: recognizer, box: box) { [weak self] text, isFinal, failed in
            guard let self else { return }

            if let text { onText(text) }
            if isFinal || failed { self.finish(failed ? .interrupted : nil) }
        }
    }

    func stop() {
        generation += 1

        guard let engine else { return }

        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        box?.request.endAudio()
    }

    func cancel() {
        generation += 1
        onFinish = nil
        task?.cancel()
        teardown()
    }

    private func finish(_ failure: DictationFailure?) {
        let callback = onFinish

        onFinish = nil
        teardown()
        callback?(failure)
    }

    private func teardown() {
        engine?.stop()
        engine?.inputNode.removeTap(onBus: 0)
        box?.request.endAudio()
        task = nil
        engine = nil
        box = nil
        Self.deactivateAudioSession()
    }

    private static func authorize() async -> Bool {
        let speech = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) }
        }

        guard speech else { return false }

        return await AVAudioApplication.requestRecordPermission()
    }

    private nonisolated static func installTap(on engine: AVAudioEngine, box: RecognitionRequestBox) {
        let input = engine.inputNode

        input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
            box.request.append(buffer)
        }
    }

    private nonisolated static func recognize(
        with recognizer: SFSpeechRecognizer,
        box: RecognitionRequestBox,
        deliver: @escaping @MainActor @Sendable (String?, Bool, Bool) -> Void
    ) -> SFSpeechRecognitionTask {
        recognizer.recognitionTask(with: box.request) { result, error in
            let text = result?.bestTranscription.formattedString
            let isFinal = result?.isFinal ?? false
            let failed = error != nil && !isFinal

            Task { @MainActor in deliver(text, isFinal, failed) }
        }
    }

    private static func activateAudioSession() throws {
        #if os(iOS)
        let session = AVAudioSession.sharedInstance()

        try session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try session.setActive(true, options: .notifyOthersOnDeactivation)
        #endif
    }

    private static func deactivateAudioSession() {
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        #endif
    }
}
