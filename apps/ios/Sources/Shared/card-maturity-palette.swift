import SwiftUI

enum CardMaturityPalette {
    static let new = Color.blue
    static let learning = Color.orange
    static let mature = Color.green
    static let zero = Color.secondary.opacity(0.6)

    static func count(_ color: Color, _ value: Int) -> Color {
        value == 0 ? zero : color
    }
}
