import SwiftUI

struct MoreVariantsSection: View {
    @State private var model: MoreVariantsModel

    init(bitId: String) {
        _model = State(initialValue: MoreVariantsModel(bitId: bitId))
    }

    var body: some View {
        Section {
            Button("Generate more question variants") { Task { await model.request() } }
                .disabled(model.isBusy || model.requested)

            if model.requested {
                Text("New variants are being generated. They show up in review within a minute or two.")
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
            }

            if let errorMessage = model.errorMessage {
                Text(errorMessage).zoomFont(.caption).foregroundStyle(.red)
            }
        }
    }
}
