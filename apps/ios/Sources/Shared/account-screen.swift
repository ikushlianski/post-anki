import PostAnkiAPI
import SwiftUI

struct AccountScreen: View {
    @State private var model = SignInGateModel()
    @State private var hasToken = TokenStore.read() != nil
    @State private var confirmingSignOut = false

    var body: some View {
        Form {
            if hasToken {
                Section {
                    Text("Signed in")
                        .foregroundStyle(.secondary)

                    Button("Sign out", role: .destructive) { confirmingSignOut = true }
                }
            } else {
                Section("Sign in to Post Anki") {
                    TextField("Email", text: $model.email)
                        #if os(iOS)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .textContentType(.username)
                        #endif
                        .autocorrectionDisabled()

                    SecureField("Password", text: $model.password)
                        #if os(iOS)
                        .textContentType(.password)
                        #endif
                        .submitLabel(.go)
                        .onSubmit { Task { await signIn() } }

                    Button("Sign in") { Task { await signIn() } }
                        .disabled(!model.canSubmit || model.isSigningIn)
                }

                if let errorMessage = model.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }
        }
        #if os(macOS)
        .formStyle(.grouped)
        #endif
        .navigationTitle("Account")
        .confirmationDialog("Sign out of this device?", isPresented: $confirmingSignOut) {
            Button("Sign out", role: .destructive) { Task { await signOut() } }
        }
    }

    private func signIn() async {
        await model.signIn()
        hasToken = TokenStore.read() != nil
    }

    private func signOut() async {
        await PasswordSignIn.signOut()
        await SignOutCleanup.run()
        try? TokenStore.clear()
        hasToken = false
        NotificationCenter.default.post(name: .postAnkiSettingsDidSave, object: nil)
    }
}
