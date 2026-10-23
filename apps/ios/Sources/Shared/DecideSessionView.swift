import PostAnkiAPI
import SwiftUI

struct DecideSessionView: View {
    let session: DecideSession
    let resolving: Set<String>
    let message: String?
    let onResolve: (String, Bool) -> Void

    var body: some View {
        Section("Verdict") {
            Text(session.verdict)
        }

        if !session.strengths.isEmpty {
            Section("Strengths") {
                ForEach(session.strengths, id: \.self) { Text("\u{2022} \($0)") }
            }
        }

        if !session.questions.isEmpty {
            Section("Questions to ask yourself") {
                ForEach(session.questions, id: \.self) { Text("\u{2022} \($0)") }
            }
        }

        if !session.blindSpots.isEmpty {
            Section("Blind spots") {
                ForEach(session.blindSpots) { spot in
                    blindSpotRow(spot)
                }

                if let message {
                    Text(message).foregroundStyle(.red)
                }
            }
        }
    }

    private func blindSpotRow(_ spot: DecideBlindSpot) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(spot.description)

            switch spot.status {
            case "accepted":
                Text("Flagged").font(.caption).foregroundStyle(.green)
            case "rejected":
                Text("Dismissed").font(.caption).foregroundStyle(.secondary)
            default:
                HStack {
                    Button("Flag as a gap to revisit") { onResolve(spot.id, true) }
                    Button("Dismiss") { onResolve(spot.id, false) }
                }
                .buttonStyle(.bordered)
                .disabled(resolving.contains(spot.id))
            }
        }
    }
}
