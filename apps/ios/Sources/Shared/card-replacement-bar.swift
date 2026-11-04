import PostAnkiAPI
import SwiftUI

struct CardReplacementBar: View {
    @Bindable var model: CardReplacementModel
    let transcript: [ChatTranscriptEntry]
    let onSaved: () async -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let card = model.proposal {
                proposal(card)
            } else {
                chip
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    private var chip: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button(model.phase == .drafting ? "Drafting replacement…" : "Suggest a replacement card") {
                Task { await model.draft(transcript: transcript) }
            }
            .buttonStyle(.bordered)
            .disabled(model.phase == .drafting)

            if let error = model.draftError {
                Text(error).zoomFont(.caption).foregroundStyle(.red)
            }
        }
    }

    private func proposal(_ card: CardProposal) -> some View {
        let saving = model.phase != .proposal(card)

        return VStack(alignment: .leading, spacing: 6) {
            Text("Proposed replacement").zoomFont(.caption).foregroundStyle(.secondary)
            Text(card.front).zoomFont(.body).fontWeight(.medium)
            Text(card.back).zoomFont(.body)

            if let example = card.example {
                Text(example).zoomFont(.subheadline).foregroundStyle(.secondary)
            }

            HStack {
                Button(saving ? "Saving…" : "Accept") {
                    Task { await model.accept(afterSaved: onSaved) }
                }
                .buttonStyle(.borderedProminent)

                Button("Ignore") { model.ignore() }
                    .buttonStyle(.bordered)
            }
            .disabled(saving)

            if let error = model.saveError {
                Text(error).zoomFont(.caption).foregroundStyle(.red)
            }
        }
    }
}
