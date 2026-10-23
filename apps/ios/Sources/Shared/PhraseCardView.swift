import PostAnkiAPI
import SwiftUI

struct PhraseCardView: View {
    let phrase: Phrase
    @Binding var answer: String
    let attempt: PhraseAttempt?
    var onSubmit: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(phrase.russian).font(.headline)

            if let attempt {
                Text(attempt.userAnswer).foregroundStyle(.secondary)

                Text("\(attempt.score)/10 - \(attempt.verdictLabel)")
                    .font(.subheadline.bold())

                Text(attempt.feedback)

                if !attempt.nativeAlternatives.isEmpty {
                    Text("Native alternatives").font(.caption).foregroundStyle(.secondary)

                    ForEach(attempt.nativeAlternatives, id: \.self) { Text("\u{2022} \($0)") }
                }

                Text("Reference: \(phrase.referenceEnglish)")
                    .font(.caption)
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
        .padding(.vertical, 4)
    }
}
