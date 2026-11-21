import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class ChatModelCatalog {
    static let shared = ChatModelCatalog()

    private(set) var options: [ChatModelOption] = []
    private(set) var selectedId: String?
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let fetch: () async throws -> [ChatModelOption]

    init(
        defaults: UserDefaults = .standard,
        fetch: @escaping () async throws -> [ChatModelOption] = { try await APIClient.chatModels() }
    ) {
        self.defaults = defaults
        self.fetch = fetch
        selectedId = ChatModelSelection.selectedId(defaults: defaults)
    }

    var currentLabel: String { ChatModelSelection.label(for: selectedId, in: options) }

    func loadIfNeeded() async {
        guard options.isEmpty else { return }

        await refresh()
    }

    func refresh() async {
        guard let fetched = try? await fetch() else { return }

        options = fetched
        selectedId = ChatModelSelection.validate(against: fetched, defaults: defaults)
    }

    func select(_ id: String?) {
        ChatModelSelection.select(id, defaults: defaults)
        selectedId = ChatModelSelection.selectedId(defaults: defaults)
    }

    func reset() { select(nil) }

    func answeredByLabel(_ id: String) -> String { ChatModelSelection.label(for: id, in: options) }
}
