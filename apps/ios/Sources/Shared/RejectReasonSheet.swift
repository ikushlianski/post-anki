import PostAnkiAPI
import SwiftUI

struct RejectReasonSheet: View {
    let feedback: PendingRejectFeedback
    let onSend: (RejectReason, String) async -> String?
    let onSkip: () -> Void

    @State private var reason: RejectReason?
    @State private var note = ""
    @State private var isSending = false
    @State private var errorMessage: String?

    private static let noteLimit = 500

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(feedback.bitBody).lineLimit(3)
                }

                Section("Why was it rejected?") {
                    ForEach(RejectReason.allCases) { option in
                        Button {
                            reason = option
                        } label: {
                            HStack {
                                Text(option.label).foregroundStyle(.primary)

                                Spacer()

                                if reason == option { Image(systemName: "checkmark") }
                            }
                        }
                    }
                }

                Section {
                    TextField("Optional note", text: $note, axis: .vertical)
                        .onChange(of: note) { _, value in
                            if value.count > Self.noteLimit { note = String(value.prefix(Self.noteLimit)) }
                        }
                } footer: {
                    Text("\(note.count)/\(Self.noteLimit)")
                }

                if let errorMessage {
                    Text(errorMessage).zoomFont(.caption).foregroundStyle(.red)
                }
            }
            .navigationTitle("Reject reason")
#if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
#endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Skip", action: onSkip).disabled(isSending)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") { Task { await send() } }
                        .disabled(reason == nil || isSending)
                }
            }
            .interactiveDismissDisabled(isSending)
        }
    }

    private func send() async {
        guard let reason else { return }

        isSending = true
        errorMessage = nil
        defer { isSending = false }

        errorMessage = await onSend(reason, note)
    }
}
