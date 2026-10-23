import SwiftUI

struct MacDailyPushView: View {
    @State private var model = DailyPushModel()

    var body: some View {
        content
            .toolbar {
                ToolbarItem {
                    Button { Task { await model.load() } } label: {
                        Label("Reload", systemImage: "arrow.clockwise")
                    }
                    .keyboardShortcut("r", modifiers: .command)
                    .disabled(model.isLoading || model.isSubmitting)
                }
            }
    }

    @ViewBuilder
    private var content: some View {
        if !model.hasLoaded, let message = model.errorMessage {
            MacLoadStateView(failure: model.failureKind ?? .other, detail: message) {
                Task { await model.load() }
            }
        } else {
            DailyPushScreen(model: model)
        }
    }
}
