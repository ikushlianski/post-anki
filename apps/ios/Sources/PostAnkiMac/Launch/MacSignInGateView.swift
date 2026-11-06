import SwiftUI

struct MacSignInGateView: View {
    @State private var model = SignInGateModel()

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "person.crop.circle")
                .font(.system(size: 44))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)

            Text("Sign in to Post Anki")
                .font(.title2.bold())

            VStack(spacing: 10) {
                TextField("Email", text: $model.email)
                    .textContentType(.username)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("sign-in-email")

                SecureField("Password", text: $model.password)
                    .textContentType(.password)
                    .onSubmit { Task { await model.signIn() } }
                    .accessibilityIdentifier("sign-in-password")
            }
            .textFieldStyle(.roundedBorder)
            .frame(width: 280)

            if let errorMessage = model.errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
                    .font(.callout)
            }

            Button {
                Task { await model.signIn() }
            } label: {
                if model.isSigningIn {
                    ProgressView().controlSize(.small)
                } else {
                    Text("Sign in")
                }
            }
            .keyboardShortcut(.defaultAction)
            .buttonStyle(.borderedProminent)
            .disabled(!model.canSubmit || model.isSigningIn)
            .accessibilityIdentifier("sign-in-submit")
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.background)
        .accessibilityIdentifier("sign-in-gate")
    }
}
