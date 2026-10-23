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
}
