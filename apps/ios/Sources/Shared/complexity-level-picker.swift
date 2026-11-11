import PostAnkiAPI
import SwiftUI

struct ComplexityLevelPicker: View {
    @Binding var selection: ComplexityLevel?
    let hasParent: Bool

    var body: some View {
        Picker(
            "Complexity",
            selection: Binding(
                get: { ComplexityChoice.shown(selection, hasParent: hasParent) },
                set: { selection = $0 }
            )
        ) {
            if hasParent {
                Text("Inherit").tag(ComplexityLevel?.none)
            }

            ForEach(ComplexityLevel.allCases) { Text($0.title).tag(ComplexityLevel?.some($0)) }
        }
        .accessibilityIdentifier("subject-complexity")
    }
}
