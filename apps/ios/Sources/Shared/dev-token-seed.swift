import Foundation

enum DevTokenSeed {
    static func seedToken(saved: String?, baked: String) -> String? {
        guard !baked.isEmpty, SignInGate.needsSignIn(token: saved) else { return nil }

        return baked
    }

    static func retryToken(rejected: String?, baked: String) -> String? {
        guard !baked.isEmpty, baked != rejected else { return nil }

        return baked
    }
}
