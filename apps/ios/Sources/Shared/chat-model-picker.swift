import PostAnkiAPI
import SwiftUI

struct ChatModelPicker: View {
    @State private var selectedId = ChatModelStore.selectedId()

    var body: some View {
        Menu {
            Picker("Model", selection: Binding(
                get: { selectedId ?? "" },
                set: { value in
                    selectedId = value.isEmpty ? nil : value
                    ChatModelStore.select(selectedId)
                }
            )) {
                Text("Default model").tag("")

                ForEach(AdminExtractionModel.all) { model in
                    Text(model.label).tag(model.id)
                }
            }
        } label: {
            Label(ChatModelStore.label(for: selectedId), systemImage: "cpu")
        }
        .accessibilityIdentifier("chat-model-picker")
    }
}
