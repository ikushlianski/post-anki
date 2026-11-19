import PostAnkiAPI
import SwiftUI

struct ShareCardButton: View {
    let card: ReviewCard

    var body: some View {
        ShareLink(item: card.shareText) {
            Label("Share card", systemImage: "square.and.arrow.up")
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .accessibilityIdentifier("review-share-card")
    }
}
