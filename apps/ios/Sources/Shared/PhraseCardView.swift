import PostAnkiAPI
import SwiftUI

struct PhraseCardView: View {
    let phrase: Phrase
    @Binding var answer: String
    let attempt: PhraseAttempt?
    var onSubmit: (() -> Void)?

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 8) {
            Text(phrase.russian).zoomFont(.headline)

            if let attempt {
                Text(attempt.userAnswer).foregroundStyle(.secondary)

                Text("\(attempt.score)/10 - \(attempt.verdictLabel)")
                    .zoomFont(.subheadline.bold())

                Text(attempt.feedback)

                if !attempt.nativeAlternatives.isEmpty {
                    Text("Native alternatives").zoomFont(.caption).foregroundStyle(.secondary)

                    ForEach(attempt.nativeAlternatives, id: \.self) { Text("\u{2022} \($0)") }
                }

                Text("Reference: \(phrase.referenceEnglish)")
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
            } else {
                #if os(macOS)
                TextField("Your English translation...", text: $answer)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { onSubmit?() }
                #else
                TextField("Your English translation...", text: $answer, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.roundedBorder)
                #endif
            }
        }
        .zoomPadding(.vertical, 4)
    }
}
