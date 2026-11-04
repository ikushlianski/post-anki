import PostAnkiAPI
import SwiftUI

struct FocusTriageDecisionList: View {
    let rows: [FocusTriageDecisionRow]
    let editing: FocusTriageDecisionEditing

    @State private var showsAccepted = false

    private func rows(_ kind: FocusTriageRowKind) -> [FocusTriageDecisionRow] { rows.filter { $0.kind == kind } }

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 12) {
            if rows.isEmpty {
                Text("You didn't decide on any cards.")
                    .zoomFont(.callout)
                    .foregroundStyle(.secondary)
            }

            section("Rejected", kind: .rejected)
            section("Sent to Chat", kind: .chat)
            section("Sent to Inbox", kind: .inbox)

            let accepted = rows(.approved)

            if !accepted.isEmpty {
                DisclosureGroup(isExpanded: $showsAccepted) {
                    ZoomVStack(alignment: .leading, spacing: 12) {
                        ForEach(accepted) { FocusTriageDecisionRowView(row: $0, editing: editing) }
                    }
                    .zoomPadding(.top, 8)
                } label: {
                    Text("Accepted (\(accepted.count))")
                        .zoomFont(.subheadline.weight(.semibold))
                }
            }
        }
    }

    @ViewBuilder
    private func section(_ title: String, kind: FocusTriageRowKind) -> some View {
        let items = rows(kind)

        if !items.isEmpty {
            Text("\(title) (\(items.count))")
                .zoomFont(.subheadline.weight(.semibold))

            ForEach(items) { FocusTriageDecisionRowView(row: $0, editing: editing) }
        }
    }
}

private extension FocusTriageRowKind {
    var symbol: String {
        switch self {
        case .approved: return "checkmark.circle.fill"
        case .rejected: return "xmark.circle.fill"
        case .chat: return "bubble.left.and.bubble.right.fill"
        case .inbox: return "tray.and.arrow.down.fill"
        }
    }

    var color: Color {
        switch self {
        case .approved: return .green
        case .rejected: return .red
        case .chat: return .teal
        case .inbox: return .indigo
        }
    }

    var accessibilityName: String {
        switch self {
        case .approved: return "Accepted"
        case .rejected: return "Rejected"
        case .chat: return "Sent to Chat"
        case .inbox: return "Sent to Inbox"
        }
    }

    var takesFeedback: Bool { self == .approved || self == .rejected }
}

private struct FocusTriageDecisionRowView: View {
    let row: FocusTriageDecisionRow
    let editing: FocusTriageDecisionEditing

    @State private var note: String
    @FocusState private var focused: Bool

    init(row: FocusTriageDecisionRow, editing: FocusTriageDecisionEditing) {
        self.row = row
        self.editing = editing
        _note = State(initialValue: row.note)
    }

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 6) {
            ZoomHStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: row.kind.symbol)
                    .foregroundStyle(row.kind.color)
                    .accessibilityLabel(row.kind.accessibilityName)

                Text(row.title)
                    .zoomFont(.callout)
                    .lineLimit(3)
            }

            if row.kind == .rejected {
                reasonChips
            }

            if row.kind.takesFeedback {
                noteField
            }

            if row.kind == .rejected || row.kind == .inbox {
                sendToChat
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var sendToChat: some View {
        switch editing.chatSend(row.bitId) {
        case .sent:
            Label("Sent to Chat", systemImage: "checkmark")
                .zoomFont(.caption)
                .foregroundStyle(.secondary)
        case .sending:
            ProgressView().controlSize(.small)
        case .failed, nil:
            Button("Send to Chat") { editing.onSendToChat(row) }
                .zoomFont(.caption)
                .buttonStyle(.bordered)

            if editing.chatSend(row.bitId) == .failed {
                Text("Couldn't send this card to Chat. Try again.")
                    .zoomFont(.caption)
                    .foregroundStyle(.red)
            }
        }
    }

    private var noteField: some View {
        TextField("Note (optional)", text: $note, axis: .vertical)
            .lineLimit(1...4)
            .textFieldStyle(.roundedBorder)
            .focused($focused)
            .onChange(of: note) {
                if note.utf16.count > FocusTriageNote.maxUnits {
                    note = FocusTriageNote.clamped(note)
                }

                editing.onNote(row.bitId, note)
            }
            .onChange(of: focused) {
                if !focused { editing.onCommit(row.bitId) }
            }
            .onSubmit { editing.onCommit(row.bitId) }
    }

    private var chipReasons: [RejectReason] {
        guard let reason = row.reason, !reason.isSelectable else { return RejectReason.selectable }

        return [reason] + RejectReason.selectable
    }

    private var reasonChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            ZoomHStack(spacing: 6) {
                ForEach(chipReasons) { reason in
                    Button {
                        editing.onReason(row.bitId, row.reason == reason ? nil : reason)
                    } label: {
                        Text(reason.label)
                            .zoomFont(.caption)
                            .zoomPadding(.horizontal, 10)
                            .zoomPadding(.vertical, 5)
                            .background(row.reason == reason ? Color.accentColor.opacity(0.25) : Color.secondary.opacity(0.15), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
