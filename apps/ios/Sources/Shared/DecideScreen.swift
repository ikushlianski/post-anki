import SwiftUI

struct DecideScreen: View {
    @State private var model = DecideModel()

    var body: some View {
        List {
            if let session = model.session {
                DecideSessionView(
                    session: session,
                    resolving: model.resolving,
                    message: model.spotMessage
                ) { id, accepted in
                    Task { await model.resolve(spotId: id, accepted: accepted) }
                }

                Section {
                    Button("New decision") { model.reset() }
                }
            } else {
                form
            }
        }
        .navigationTitle("Challenge my thinking")
        .inlineNavigationTitle()
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                NavigationLink("History") { DecideHistoryScreen() }
            }
        }
    }

    @ViewBuilder
    private var form: some View {
        Section("Decision") {
            TextField(
                "e.g. Should we move sessions from JWTs to server-side sessions?",
                text: $model.decision,
                axis: .vertical
            )
            .lineLimit(3...8)
        }

        Section("Where you lean") {
            TextField(
                "Say where you currently lean and your reasoning.",
                text: $model.opinion,
                axis: .vertical
            )
            .lineLimit(4...12)
        }

        Section {
            Button {
                Task { await model.submit() }
            } label: {
                if model.isSubmitting {
                    HStack {
                        ProgressView()
                        Text("Evaluating...")
                    }
                } else {
                    Text("Challenge my thinking")
                }
            }
            .disabled(!model.canSubmit)

            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
    }
}
