import Foundation
import PostAnkiAPI

@Observable
@MainActor
final class DictationModel {
    private(set) var isListening = false
    private(set) var message: String?
    private(set) var isBlocked = false

    private let dictator: SpeechDictating
    private var base = ""
    private var lastEmitted: String?
    private var session = 0

    init(dictator: SpeechDictating? = nil) {
        self.dictator = dictator ?? SystemSpeechDictator()
    }

    var isSupported: Bool { dictator.isSupported }

    func toggle(draft: String, apply: @escaping @MainActor (String) -> Void) async {
        if isListening {
            dictator.stop()

            return
        }

        guard !isBlocked else { return }

        session += 1

        let current = session

        base = draft
        message = nil
        isListening = true
        await dictator.start(
            onText: { [weak self] text in
                guard let self, self.session == current else { return }

                let merged = DictationText.merge(base: self.base, transcript: text)

                self.lastEmitted = merged
                apply(merged)
            },
            onFinish: { [weak self] failure in
                guard let self, self.session == current else { return }

                self.end(failure)
            }
        )
    }

    func draftChanged(to draft: String) {
        if isListening, let lastEmitted, draft != lastEmitted {
            cancel()
        }
    }

    func cancel() {
        session += 1
        dictator.cancel()
        lastEmitted = nil
        isListening = false
    }

    private func end(_ failure: DictationFailure?) {
        isListening = false
        lastEmitted = nil
        message = failure?.message

        if failure == .permissionDenied { isBlocked = true }
    }
}
