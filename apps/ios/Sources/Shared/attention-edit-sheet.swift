import SwiftUI

struct AttentionEditSheet: View {
    static let maxCharacters = 50_000

    let initialText: String
    let onSubmit: (String) -> Void
    let onCancel: () -> Void

    @State private var text: String
    @State private var confirmingDiscard = false

    init(initialText: String, onSubmit: @escaping (String) -> Void, onCancel: @escaping () -> Void) {
        self.initialText = initialText
        self.onSubmit = onSubmit
        self.onCancel = onCancel
        _text = State(initialValue: initialText)
    }

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var hasChanges: Bool { text != initialText }

    private var isTooLong: Bool { trimmed.count > Self.maxCharacters }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 8) {
                TextEditor(text: $text)
                    .padding(8)
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.secondary.opacity(0.3)))

                if isTooLong {
                    Text("This note is over \(Self.maxCharacters) characters. Split it and add the parts separately.")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
            .padding()
            .keyboardDismissal()
            .navigationTitle("Edit note")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        if hasChanges { confirmingDiscard = true } else { onCancel() }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Retry") { onSubmit(trimmed) }
                        .disabled(trimmed.isEmpty || isTooLong)
                }
            }
            .interactiveDismissDisabled(hasChanges)
            .confirmationDialog("Discard changes?", isPresented: $confirmingDiscard, titleVisibility: .visible) {
                Button("Discard", role: .destructive, action: onCancel)
                Button("Keep editing", role: .cancel) {}
            }
        }
    }
}
