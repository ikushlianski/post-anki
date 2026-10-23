import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Test connection reports the exact outcome")
    struct ConnectionCheckSmokeTests {
        @Test("should classify a rejected token, an offline device and a server error differently")
        func classification() {
            #expect(ConnectionResult.classify(APIError.unauthorized) == .rejectedToken)
            #expect(ConnectionResult.classify(URLError(.notConnectedToInternet)) == .offline)
            #expect(ConnectionResult.classify(URLError(.cannotConnectToHost)) == .unreachable)
            #expect(ConnectionResult.classify(APIError.badStatus(503, nil)) == .serverError(503))
            #expect(ConnectionResult.classify(URLError(.cancelled)) == nil)
        }

        @Test("should report the server as unreachable when the connection fails")
        func unreachableAgainstFake() async {
            let session = FakeServerSession(["/streak": .failure(.cannotConnectToHost)])
            defer { session.end() }

            #expect(await ConnectionResult.run(hasToken: true) == .unreachable)
        }

        @Test("should report the exact status when the server answers with an error")
        func statusAgainstFake() async {
            let session = FakeServerSession(["/streak": .status(500)])
            defer { session.end() }

            #expect(await ConnectionResult.run(hasToken: true) == .serverError(500))
        }

        @Test("should say no token is saved instead of a rejected token when the server answers 401 without one")
        func noTokenUnauthorized() async {
            let session = FakeServerSession(["/streak": .status(401)])
            defer { session.end() }

            #expect(await ConnectionResult.run(hasToken: false) == .reachableNotSignedIn)
            #expect(await ConnectionResult.run(hasToken: true) == .rejectedToken)
        }

        @Test("should report certificate and TLS problems separately from an unreachable server")
        func tlsClassification() {
            #expect(ConnectionResult.classify(URLError(.serverCertificateUntrusted)) == .secureConnectionFailed)
            #expect(ConnectionResult.classify(URLError(.secureConnectionFailed)) == .secureConnectionFailed)
            #expect(ConnectionResult.classify(URLError(.serverCertificateHasBadDate)) == .secureConnectionFailed)
            #expect(ConnectionResult.secureConnectionFailed.message != ConnectionResult.unreachable.message)
        }

        @Test("should report a slow server as timed out")
        func timeoutClassification() {
            #expect(ConnectionResult.classify(URLError(.timedOut)) == .timedOut)
            #expect(ConnectionResult.timedOut.message != ConnectionResult.unreachable.message)
        }

        @Test("should probe the typed address instead of the saved one")
        func typedAddressProbe() async {
            let session = FakeServerSession(["/streak": .failure(.timedOut)])
            defer { session.end() }

            UserDefaults.standard.set("https://saved.invalid", forKey: "apiBaseURL")

            #expect(await ConnectionResult.run(hasToken: true, baseURL: "https://\(FakeServer.host)") == .timedOut)
            #expect(FakeServer.requested == ["/streak"])
        }

        @Test("should copy only yes or no for the signed-in state, never a token")
        func diagnosticsHideToken() {
            let report = Diagnostics.report(failures: [], hasToken: true)

            #expect(report.contains("Signed in: yes"))
            #expect(!report.contains("Bearer"))
        }
    }
}
