import SwiftUI

struct CardMaturitySection: View {
    let model: CardMaturityModel

    var body: some View {
        Section("Card maturity") {
            if let breakdown = model.breakdown {
                if breakdown.isEmpty {
                    Text("No cards yet").foregroundStyle(.secondary)
                } else {
                    CardMaturityBar(breakdown: breakdown)
                    row("Mature", breakdown.mature, breakdown, CardMaturityPalette.mature)
                    row("Learning", breakdown.learning, breakdown, CardMaturityPalette.learning)
                    row("New", breakdown.new, breakdown, CardMaturityPalette.new)
                }
            } else if model.failed {
                Text("Couldn't load card maturity.").foregroundStyle(.secondary)
            }
        }
        .accessibilityIdentifier("progress-card-maturity")
    }

    private func row(_ label: String, _ count: Int, _ breakdown: CardMaturityBreakdown, _ color: Color) -> some View {
        HStack {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label)
            Spacer()
            Text("\(breakdown.percent(count))% · \(count)").monospacedDigit().foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}
