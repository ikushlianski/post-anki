import SwiftUI
#if os(iOS)
import UIKit
#endif

private struct KeyboardDismissalModifier: ViewModifier {
    func body(content: Content) -> some View {
        #if os(iOS)
        content
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") {
                        UIApplication.shared.sendAction(
                            #selector(UIResponder.resignFirstResponder),
                            to: nil,
                            from: nil,
                            for: nil
                        )
                    }
                }
            }
        #else
        content
        #endif
    }
}

extension View {
    func keyboardDismissal() -> some View {
        modifier(KeyboardDismissalModifier())
    }
}
