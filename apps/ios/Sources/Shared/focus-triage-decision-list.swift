import PostAnkiAPI
import SwiftUI

struct FocusTriageDecisionList: View {
    let rows: [FocusTriageDecisionRow]
    let editing: FocusTriageDecisionEditing

    private var rejected: [FocusTriageDecisionRow] { rows.filter { $0.verdict == .rejected } }
    private var approved: [FocusTriageDecisionRow] { rows.filter { $0.verdict == .approved } }

    var body: some View {
        if !rows.isEmpty {
            ZoomVStack(alignment: .leading, spacing: 12) {
                Text("Your decisions")
                    .zoomFont(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                if !rejected.isEmpty {
                    Text("Rejected (\(rejected.count))")
                        .zoomFont(.subheadline.weight(.semibold))

                    ForEach(rejected) { row in
                        FocusTriageDecisionRowView(row: row, editing: editing)
                    }
                }

                if !approved.isEmpty {
                    Text("Accepted (\(approved.count))")
                        .zoomFont(.subheadline.weight(.semibold))

                    ForEach(approved) { row in
                        FocusTriageDecisionRowView(row: row, editing: editing)
                    }
                }
            }
        }
    }
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
                Image(systemName: row.verdict == .approved ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .foregroundStyle(row.verdict == .approved ? Color.green : Color.red)
                    .accessibilityLabel(row.verdict == .approved ? "Accepted" : "Rejected")

                Text(row.title)
                    .zoomFont(.callout)
                    .lineLimit(3)
            }

            if row.verdict == .rejected {
                reasonChips
            }

            TextField("Note (optional)", text: $note, axis: .vertical)
                .lineLimit(1...4)
                .textFieldStyle(.roundedBorder)
                .focused($focused)
                .onChange(of: note) {
                    if note.count > FocusTriageNote.maxCharacters {
                        note = String(note.prefix(FocusTriageNote.maxCharacters))
                    }

                    editing.onNote(row.bitId, note)
                }
                .onChange(of: focused) {
                    if !focused { editing.onCommit(row.bitId) }
                }
                .onSubmit { editing.onCommit(row.bitId) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var reasonChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            ZoomHStack(spacing: 6) {
                ForEach(RejectReason.allCases) { reason in
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
