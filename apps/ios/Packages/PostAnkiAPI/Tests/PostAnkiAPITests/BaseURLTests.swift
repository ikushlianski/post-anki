import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Server address precedence", .serialized)
struct BaseURLTests {
    @Test("should prefer the address saved in Settings over the dev default")
    func savedWins() {
        #expect(APIClient.resolveBaseURL(saved: "https://saved.example", fallback: "http://localhost:3000") == "https://saved.example")
    }

    @Test("should use the dev default when nothing is saved")
    func fallbackUsed() {
        #expect(APIClient.resolveBaseURL(saved: nil, fallback: "http://localhost:3000") == "http://localhost:3000")
    }

    @Test("should use production when neither a saved address nor a dev default exists")
    func productionUsed() {
        #expect(APIClient.resolveBaseURL(saved: nil, fallback: nil) == APIClient.productionBaseURLString)
        #expect(APIClient.resolveBaseURL(saved: "", fallback: "  ") == APIClient.productionBaseURLString)
    }

    @Test("should return to the dev default after the saved address is cleared")
    func clearingRestoresDefault() {
        let previous = UserDefaults.standard.string(forKey: "apiBaseURL")
        defer {
            UserDefaults.standard.set(previous, forKey: "apiBaseURL")
            APIClient.setFallbackBaseURL(nil)
        }

        APIClient.setFallbackBaseURL("http://localhost:3000")
        APIClient.baseURLString = "https://saved.example"

        #expect(APIClient.baseURLString == "https://saved.example")
        #expect(APIClient.hasSavedBaseURL)

        APIClient.clearSavedBaseURL()

        #expect(APIClient.baseURLString == "http://localhost:3000")
        #expect(!APIClient.hasSavedBaseURL)
    }

    @Test("should pick the launch argument, then the saved Settings address, then the build default")
    func fullOrder() {
        let launch = "http://127.0.0.1:9999"
        let saved = "http://localhost:5560"
        let build = "http://localhost:3000"

        #expect(APIClient.resolveBaseURL(launchArgument: launch, saved: saved, fallback: build) == launch)
        #expect(APIClient.resolveBaseURL(launchArgument: nil, saved: saved, fallback: build) == saved)
        #expect(APIClient.resolveBaseURL(launchArgument: " ", saved: saved, fallback: build) == saved)
        #expect(APIClient.resolveBaseURL(launchArgument: nil, saved: nil, fallback: build) == build)
        #expect(APIClient.resolveBaseURL(launchArgument: nil, saved: nil, fallback: nil) == APIClient.productionBaseURLString)
    }

    @Test("should let a launch argument beat a saved Settings address in the live lookup")
    func liveLaunchArgument() {
        let previous = UserDefaults.standard.string(forKey: "apiBaseURL")
        let args = UserDefaults.standard.volatileDomain(forName: UserDefaults.argumentDomain)
        defer {
            UserDefaults.standard.setVolatileDomain(args, forName: UserDefaults.argumentDomain)
            UserDefaults.standard.set(previous, forKey: "apiBaseURL")
        }

        UserDefaults.standard.removeObject(forKey: "apiBaseURL")
        APIClient.baseURLString = "http://localhost:5560"
        #expect(APIClient.baseURLString == "http://localhost:5560")

        var withArg = args
        withArg["apiBaseURL"] = "http://127.0.0.1:9999"
        UserDefaults.standard.setVolatileDomain(withArg, forName: UserDefaults.argumentDomain)

        #expect(APIClient.baseURLString == "http://127.0.0.1:9999")
    }
}
