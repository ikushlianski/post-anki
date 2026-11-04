import SwiftUI

extension View {
    func onEnterKeyPress(_ action: @escaping (KeyPress) -> KeyPress.Result) -> some View {
        onKeyPress(keys: [.return], action: action)
            .onKeyPress(characters: CharacterSet(charactersIn: "\u{3}"), action: action)
    }
}
