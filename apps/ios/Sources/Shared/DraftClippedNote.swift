import SwiftUI

struct DraftClippedNote: View {
    var body: some View {
        Text("Kept first \(UnsentDraftStore.maxCharacters.formatted()) characters")
            .font(.caption)
            .foregroundStyle(.orange)
    }
}
