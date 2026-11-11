import SwiftUI

struct CardMaturityBar: View {
    let breakdown: CardMaturityBreakdown
    var width: CGFloat?

    var body: some View {
        GeometryReader { proxy in
            HStack(spacing: 0) {
                if let fractions = breakdown.fractions {
                    CardMaturityPalette.mature.frame(width: proxy.size.width * fractions.mature)
                    CardMaturityPalette.learning.frame(width: proxy.size.width * fractions.learning)
                    CardMaturityPalette.new.frame(width: proxy.size.width * fractions.new)
                }

                Spacer(minLength: 0)
            }
        }
        .frame(width: width, height: 8)
        .background(Color.secondary.opacity(0.2))
        .clipShape(Capsule())
        .accessibilityElement()
        .accessibilityLabel(breakdown.countsSummary)
    }
}

struct SubjectDepthBar: View {
    let entry: SubjectTreeEntry

    private var fractions: SubjectDepthFractions { SubjectDepthFractions(entry: entry) }

    var body: some View {
        GeometryReader { proxy in
            HStack(spacing: 0) {
                CardMaturityPalette.mature.frame(width: proxy.size.width * fractions.mature)
                CardMaturityPalette.learning.frame(width: proxy.size.width * fractions.learning)
                CardMaturityPalette.new.frame(width: proxy.size.width * fractions.new)
                Spacer(minLength: 0)
            }
        }
        .frame(width: 72, height: 8)
        .background(Color.secondary.opacity(0.2))
        .clipShape(Capsule())
        .accessibilityElement()
        .accessibilityLabel("\(entry.matureCount) mature, \(entry.learningCount) learning, \(entry.newCount) new")
    }
}
