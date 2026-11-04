import SwiftUI

struct MacDestructiveRequest: Identifiable {
    let id = UUID()
    let title: String
    let confirmLabel: String
    let message: String?
    let action: @MainActor () -> Void

    init(verb: String, count: Int, noun: String, message: String? = nil, action: @escaping @MainActor () -> Void) {
        let subject = count == 1 ? "this \(noun)" : "\(count) \(noun)s"

        title = "\(verb) \(subject)?"
        confirmLabel = verb
        self.message = message
        self.action = action
    }
}

extension View {
    func macConfirmDestructive(_ request: Binding<MacDestructiveRequest?>) -> some View {
        confirmationDialog(
            request.wrappedValue?.title ?? "",
            isPresented: Binding(
                get: { request.wrappedValue != nil },
                set: { if !$0 { request.wrappedValue = nil } }
            ),
            titleVisibility: .visible,
            presenting: request.wrappedValue
        ) { pending in
            Button(pending.confirmLabel, role: .destructive) { pending.action() }
            Button("Cancel", role: .cancel) {}
        } message: { pending in
            if let message = pending.message { Text(message) }
        }
    }
}
