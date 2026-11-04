import SwiftUI

struct CardMaturityBar: View {
    let breakdown: CardMaturityBreakdown
    var width: CGFloat?

    var body: some View {
        GeometryReader { proxy in
            HStack(spacing: 0) {
                if let fractions = breakdown.fractions {
                    Color.accentColor.frame(width: proxy.size.width * fractions.mature)
                    Color.accentColor.opacity(0.6).frame(width: proxy.size.width * fractions.learning)
                    Color.accentColor.opacity(0.3).frame(width: proxy.size.width * fractions.new)
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
                Color.accentColor.frame(width: proxy.size.width * fractions.mature)
                Color.accentColor.opacity(0.6).frame(width: proxy.size.width * fractions.learning)
                Color.accentColor.opacity(0.3).frame(width: proxy.size.width * fractions.new)
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
