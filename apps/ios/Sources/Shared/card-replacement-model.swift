import Foundation
import Observation
import PostAnkiAPI

@Observable
@MainActor
final class CardReplacementModel {
    enum Phase: Equatable {
        case idle
        case drafting
        case proposal(CardProposal)
        case saving(CardProposal)
    }

    let knowledgeBitId: String
    var phase: Phase = .idle
    var draftError: String?
    var saveError: String?

    init(knowledgeBitId: String) {
        self.knowledgeBitId = knowledgeBitId
    }

    var proposal: CardProposal? {
        switch phase {
        case .proposal(let card), .saving(let card): card
        case .idle, .drafting: nil
        }
    }

    func draft(transcript: [ChatTranscriptEntry]) async {
        guard phase == .idle else { return }

        phase = .drafting
        draftError = nil

        do {
            let card = try await APIClient.draftReplacementCard(id: knowledgeBitId, transcript: transcript)
            phase = .proposal(card)
        } catch {
            draftError = "Could not draft a replacement right now — try again."
            phase = .idle
        }
    }

    func accept(afterSaved: () async -> Void) async {
        guard case .proposal(let card) = phase else { return }

        phase = .saving(card)
        saveError = nil

        do {
            _ = try await APIClient.createDerivedItem(id: knowledgeBitId, card: card)
        } catch {
            saveError = "Could not save the replacement — try again."
            phase = .proposal(card)

            return
        }

        phase = .idle
        await afterSaved()
    }

    func ignore() {
        guard case .proposal = phase else { return }

        saveError = nil
        phase = .idle
    }
}
