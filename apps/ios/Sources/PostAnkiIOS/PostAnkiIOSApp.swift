import PostAnkiAPI
import SwiftUI

@main
struct PostAnkiIOSApp: App {
    init() {
        #if DEBUG
        let value = Bundle.main.object(forInfoDictionaryKey: "PostAnkiDevAPIURL") as? String
        APIClient.setFallbackBaseURL(value)
        #endif
    }

    var body: some Scene {
        WindowGroup {
            HomeView()
                .injectionReloadable()
        }
    }
}
