import SwiftUI

struct SignInGateScreen: View {
    @State private var model = SignInGateModel()

    var body: some View {
        VStack(spacing: 0) {
            Form {
                Section {
                    TextField("Email", text: $model.email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .textContentType(.username)
                        .autocorrectionDisabled()

                    SecureField("Password", text: $model.password)
                        .textContentType(.password)
                        .submitLabel(.go)
                        .onSubmit { Task { await model.signIn() } }
                } header: {
                    Text("Sign in to Post Anki")
                }

                if let errorMessage = model.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }

            MainActionControls(tiles: [
                MainActionTile(
                    title: "Sign in",
                    style: .prominent,
                    isLoading: model.isSigningIn,
                    isDisabled: !model.canSubmit
                ) { Task { await model.signIn() } }
            ])
        }
    }
}
