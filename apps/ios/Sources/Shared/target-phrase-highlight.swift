import Foundation
import SwiftUI

enum TargetPhraseHighlight {
    static func attributed(_ sentence: String, phrase: String) -> AttributedString {
        var result = AttributedString(sentence)
        let target = phrase.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !target.isEmpty,
              let found = sentence.range(of: target, options: [.caseInsensitive, .diacriticInsensitive]),
              let range = Range(found, in: result)
        else { return result }

        result[range].underlineStyle = .single
        result[range].inlinePresentationIntent = .stronglyEmphasized

        return result
    }
}
