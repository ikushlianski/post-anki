import Foundation

@MainActor
final class UnsentDraftStore {
    static let shared = UnsentDraftStore()

    static let maxCharacters = 10_000
    static let maxDrafts = 40

    private var drafts: [String: String] = [:]
    private var order: [String] = []
    private var clippedKeys = Set<String>()
    private var lastScope: String
    private let scopeProvider: () -> String

    init(
        notificationCenter: NotificationCenter = .default,
        scopeProvider: @escaping () -> String = { ServerScope.current }
    ) {
        self.scopeProvider = scopeProvider
        lastScope = scopeProvider()
        notificationCenter.addObserver(
            forName: .postAnkiSettingsDidSave,
            object: nil,
            queue: nil
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.settingsDidSave() }
        }
    }

    func settingsDidSave() {
        let scope = scopeProvider()

        guard scope != lastScope else { return }

        lastScope = scope
        keepOnly(prefix: scope + "|")
    }

    private func keepOnly(prefix: String) {
        order.removeAll { !$0.hasPrefix(prefix) }
        drafts = drafts.filter { $0.key.hasPrefix(prefix) }
        clippedKeys = clippedKeys.filter { $0.hasPrefix(prefix) }
    }

    static func key(_ screen: String, _ detail: String? = nil) -> String {
        [ServerScope.current, screen, detail].compactMap { $0 }.joined(separator: "|")
    }

    static func clip(_ text: String) -> String {
        String(text.prefix(maxCharacters))
    }

    func text(for key: String) -> String? {
        drafts[key]
    }

    var hasAny: Bool {
        drafts.values.contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    func wasClipped(for key: String) -> Bool {
        clippedKeys.contains(key)
    }

    func set(_ text: String, for key: String) {
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            clear(key)

            return
        }

        drafts[key] = Self.clip(text)

        if text.count > Self.maxCharacters {
            clippedKeys.insert(key)
        } else {
            clippedKeys.remove(key)
        }

        order.removeAll { $0 == key }
        order.append(key)

        while order.count > Self.maxDrafts {
            let evicted = order.removeFirst()
            drafts[evicted] = nil
            clippedKeys.remove(evicted)
        }
    }

    func clear(_ key: String) {
        drafts[key] = nil
        clippedKeys.remove(key)
        order.removeAll { $0 == key }
    }

    func reset() {
        drafts = [:]
        order = []
        clippedKeys = []
    }
}
