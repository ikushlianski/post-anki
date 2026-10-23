import SwiftUI

#if DEBUG
@MainActor
final class InjectionReloader: ObservableObject {
    static let shared = InjectionReloader()

    @Published private(set) var generation = 0

    private init() {
        #if os(macOS)
        let bundleName = "macOSInjection"
        #else
        let bundleName = "iOSInjection"
        #endif
        let path = "/Applications/InjectionIII.app/Contents/Resources/\(bundleName).bundle"

        Bundle(path: path)?.load()
        NotificationCenter.default.addObserver(
            forName: Notification.Name("INJECTION_BUNDLE_NOTIFICATION"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.generation += 1 }
        }
    }
}

private struct InjectionReloadModifier: ViewModifier {
    @ObservedObject private var reloader = InjectionReloader.shared

    func body(content: Content) -> some View {
        content.id(reloader.generation)
    }
}

extension View {
    func injectionReloadable() -> some View {
        modifier(InjectionReloadModifier())
    }
}
#else
extension View {
    func injectionReloadable() -> some View { self }
}
#endif
