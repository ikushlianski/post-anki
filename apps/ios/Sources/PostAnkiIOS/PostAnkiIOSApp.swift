import PostAnkiAPI
import SwiftUI

@main
struct PostAnkiIOSApp: App {
    init() {
        #if DEBUG
        let value = Bundle.main.object(forInfoDictionaryKey: "PostAnkiDevAPIURL") as? String
        APIClient.setFallbackBaseURL(value)

        let token = (Bundle.main.object(forInfoDictionaryKey: "PostAnkiLocalDevAPIToken") as? String) ?? ""

        if let seed = DevTokenSeed.seedToken(saved: TokenStore.read(), baked: token) {
            try? TokenStore.save(seed)
        }
        #endif
    }

    var body: some Scene {
        WindowGroup {
            HomeView()
                .injectionReloadable()
        }
    }
}
