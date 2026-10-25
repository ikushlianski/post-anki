import PostAnkiAPI
import SwiftUI

@main
struct PostAnkiIOSApp: App {
    init() {
        #if DEBUG
        let value = Bundle.main.object(forInfoDictionaryKey: "PostAnkiDevAPIURL") as? String
        APIClient.setFallbackBaseURL(value)

        let token = (Bundle.main.object(forInfoDictionaryKey: "PostAnkiLocalDevAPIToken") as? String) ?? ""

        if !token.isEmpty, TokenStore.read() == nil {
            try? TokenStore.save(token)
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
