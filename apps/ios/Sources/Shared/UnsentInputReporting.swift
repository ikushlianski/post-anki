import SwiftUI

@MainActor
final class UnsentInputSources {
    static let shared = UnsentInputSources()

    private var sources = Set<String>()

    var isEmpty: Bool { sources.isEmpty }

    func set(_ source: String, hasInput: Bool) {
        if hasInput {
            sources.insert(source)
        } else {
            sources.remove(source)
        }
    }
}

extension View {
    func reportsUnsentInput(_ source: String, _ hasInput: Bool) -> some View {
        modifier(UnsentInputReporter(source: source, hasInput: hasInput))
    }
}

private struct UnsentInputReporter: ViewModifier {
    let source: String
    let hasInput: Bool

    func body(content: Content) -> some View {
        content
            .onChange(of: hasInput, initial: true) { UnsentInputSources.shared.set(source, hasInput: hasInput) }
            .onDisappear { UnsentInputSources.shared.set(source, hasInput: false) }
    }
}
