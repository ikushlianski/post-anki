import Foundation
import PostAnkiAPI
#if canImport(UIKit)
import UIKit
#endif

enum SignInGate {
    static func needsSignIn(token: String?) -> Bool {
        guard let token else { return true }

        return token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    static func deviceLabel(isMac: Bool, deviceName: String) -> String {
        let name = deviceName.trimmingCharacters(in: .whitespacesAndNewlines)

        if isMac { return "Mac" }

        return name.isEmpty ? "iPhone" : "iPhone \(name)"
    }

    static var currentDeviceLabel: String {
        #if os(macOS)
        deviceLabel(isMac: true, deviceName: "")
        #else
        deviceLabel(isMac: false, deviceName: UIDevice.current.name)
        #endif
    }

    static func message(for error: Error) -> String {
        switch error {
        case PasswordSignInError.wrongCredentials: "Wrong email or password."
        case PasswordSignInError.rateLimited: "Too many attempts. Wait a minute and try again."
        case PasswordSignInError.insecureAddress: "Use an https:// server address to sign in."
        case is URLError: "Couldn't connect to the server. Try again."
        default: "Couldn't sign in."
        }
    }
}

@Observable
@MainActor
final class SignInGateModel {
    var email = ""
    var password = ""
    var isSigningIn = false
    var errorMessage: String?

    var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty
    }

    func signIn() async {
        guard canSubmit, !isSigningIn else { return }

        errorMessage = nil
        isSigningIn = true
        defer { isSigningIn = false }

        do {
            try await PasswordSignIn.signIn(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password,
                label: SignInGate.currentDeviceLabel
            )
            password = ""
            NotificationCenter.default.post(name: .postAnkiSettingsDidSave, object: nil)
        } catch {
            errorMessage = SignInGate.message(for: error)
        }
    }
}
