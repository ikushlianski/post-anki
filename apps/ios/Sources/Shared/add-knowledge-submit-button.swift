import SwiftUI

struct AddKnowledgeSubmitButton: View {
    let isSubmitting: Bool
    let canSubmit: Bool
    let onSubmit: () -> Void

    var body: some View {
        Button(action: onSubmit) {
            ZStack {
                Text("Submit").font(.headline).opacity(isSubmitting ? 0 : 1)

                if isSubmitting { ProgressView().controlSize(.small) }
            }
            .frame(maxWidth: .infinity, minHeight: 32)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(!canSubmit)
        .optionalSubmitShortcut()
        .accessibilityIdentifier("add-knowledge-submit")
    }
}

private extension View {
    @ViewBuilder
    func optionalSubmitShortcut() -> some View {
        #if os(macOS)
        keyboardShortcut(.return, modifiers: .command)
        #else
        self
        #endif
    }
}
