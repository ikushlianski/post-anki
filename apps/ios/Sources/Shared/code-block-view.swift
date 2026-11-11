import SwiftUI

enum CodeWrapStore {
    static let key = "postanki.code-wrap"
}

struct CodeBlockView: View {
    let code: String
    let language: String?
    @AppStorage(CodeWrapStore.key) private var wraps = true
    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()
            codeText
        }
        .background(Color.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.12), lineWidth: 1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }

    private var header: some View {
        ZoomHStack(spacing: 8) {
            Text(language ?? "code")
                .zoomFont(.caption.monospaced())
                .foregroundStyle(.secondary)

            Spacer(minLength: 0)

            Button(wraps ? "Wrap: on" : "Wrap: off") { wraps.toggle() }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .accessibilityValue(wraps ? "On" : "Off")

            Button(copied ? "Copied" : "Copy", systemImage: "doc.on.doc") {
                CopyToPasteboard.copy(code)
                copied = true

                Task {
                    try? await Task.sleep(for: .seconds(1.5))
                    copied = false
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .zoomPadding(8)
    }

    @ViewBuilder
    private var codeText: some View {
        if wraps {
            padded(codeLabel)
        } else {
            ScrollView(.horizontal, showsIndicators: true) {
                padded(codeLabel.fixedSize(horizontal: true, vertical: false))
            }
        }
    }

    private var codeLabel: some View {
        Text(verbatim: code.isEmpty ? " " : code)
            .zoomFont(.callout.monospaced())
            .textSelection(.enabled)
    }

    private func padded(_ label: some View) -> some View {
        label
            .frame(maxWidth: wraps ? .infinity : nil, alignment: .leading)
            .zoomPadding(10)
    }
}
