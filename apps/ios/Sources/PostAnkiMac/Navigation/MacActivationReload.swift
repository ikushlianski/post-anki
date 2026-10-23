import AppKit

@MainActor
final class MacUnsentInput {
    static let shared = MacUnsentInput()

    func set(_ source: String, hasInput: Bool) {
        UnsentInputSources.shared.set(source, hasInput: hasInput)
    }

    var hasAny: Bool {
        if !UnsentInputSources.shared.isEmpty || UnsentDraftStore.shared.hasAny { return true }

        guard let editor = NSApp.keyWindow?.firstResponder as? NSTextView else { return false }

        return !editor.string.isEmpty
    }
}

enum MacActivationReloadPolicy {
    static let awayThreshold: TimeInterval = 300

    static func shouldReload(resignedAt: Date?, now: Date, hasUnsentInput: Bool) -> Bool {
        guard let resignedAt, !hasUnsentInput else { return false }

        return now.timeIntervalSince(resignedAt) > awayThreshold
    }
}
