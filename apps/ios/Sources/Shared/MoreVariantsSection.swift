import SwiftUI

struct MoreVariantsSection: View {
    let model: MoreVariantsModel

    var body: some View {
        if model.requested || model.errorMessage != nil {
            Section {
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
}
