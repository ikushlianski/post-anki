import SwiftUI

struct DueReviewBottomBar: View {
    let model: DueReviewModel

    var body: some View {
        if !model.isRevealed {
            Button {
                model.reveal()
            } label: {
                Text("Show Answer")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal)
            .padding(.vertical, 8)
            .background(.bar)
        }
    }
}
