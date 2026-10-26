import SwiftUI

struct SubjectDepthBar: View {
    let entry: SubjectTreeEntry

    private var fractions: SubjectDepthFractions { SubjectDepthFractions(entry: entry) }

    var body: some View {
        GeometryReader { proxy in
            HStack(spacing: 0) {
                Color.green.frame(width: proxy.size.width * fractions.mature)
                Color.orange.frame(width: proxy.size.width * fractions.learning)
                Color.blue.frame(width: proxy.size.width * fractions.new)
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
