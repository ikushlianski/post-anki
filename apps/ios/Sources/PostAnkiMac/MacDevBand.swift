import SwiftUI

enum MacDevBandLabel {
    static func current(_ bundle: Bundle = .main) -> String? {
        let raw = bundle.object(forInfoDictionaryKey: "PostAnkiBandLabel") as? String
        let label = raw?.trimmingCharacters(in: .whitespaces) ?? ""

        return label.isEmpty || label.hasPrefix("$(") ? nil : label
    }
}

struct MacDevBand: View {
    var label: String? = MacDevBandLabel.current()

    var body: some View {
        if let label {
            Text(label.uppercased())
                .font(.caption.bold())
                .tracking(2)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 22)
                .background(Color.orange)
                .accessibilityIdentifier("dev-band")
        }
    }
}
