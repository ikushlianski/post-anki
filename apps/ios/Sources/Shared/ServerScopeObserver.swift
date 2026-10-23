import Foundation

@MainActor
final class ServerScopeObserver {
    private var lastScope: String
    private let scopeProvider: () -> String
    private let onChange: () -> Void

    init(
        notificationCenter: NotificationCenter = .default,
        scopeProvider: @escaping () -> String = { ServerScope.current },
        onChange: @escaping () -> Void
    ) {
        self.scopeProvider = scopeProvider
        self.onChange = onChange
        lastScope = scopeProvider()
        notificationCenter.addObserver(
            forName: .postAnkiSettingsDidSave,
            object: nil,
            queue: nil
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.settingsDidSave() }
        }
    }

    private func settingsDidSave() {
        let scope = scopeProvider()

        guard scope != lastScope else { return }

        lastScope = scope
        onChange()
    }
}
