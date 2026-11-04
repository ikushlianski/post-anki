import PostAnkiAPI
import SwiftUI

struct RejectedSubjectMenu: View {
    let selected: String?
    let options: [RejectedSubjectOption]
    let notice: String?
    let onSelect: (String?) -> Void
    let onRetry: () -> Void

    private var title: String {
        guard let selected else { return "All subjects" }

        return options.first { $0.id == selected }?.label ?? "Subject"
    }

    var body: some View {
        HStack {
            Menu {
                Button("All subjects") { onSelect(nil) }

                ForEach(options) { option in
                    Button(option.label) { onSelect(option.id) }
                }
            } label: {
                Label(title, systemImage: "folder")
                    .font(.subheadline)
                    .lineLimit(1)
            }
            .accessibilityLabel("Filter by subject")
            .accessibilityValue(title)
            .accessibilityIdentifier("rejected-cards-subject")

            if let notice {
                Text(notice).font(.caption).foregroundStyle(.secondary)
                Button("Retry", action: onRetry).font(.caption)
            }

            Spacer()
        }
        .padding(.horizontal)
        .padding(.top, 8)
    }
}

struct RejectedSourceTitle: View {
    let card: RejectedCard

    var body: some View {
        if let title = card.sourceTitleText {
            if let link = card.sourceLink {
                Link(title, destination: link)
                    .font(.caption)
                    .lineLimit(1)
            } else {
                Text(title).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
        }
    }
}

struct RejectedReasonChips: View {
    let selected: RejectedCardReason?
    let counts: RejectedReasonCounts?
    let onSelect: (RejectedCardReason?) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(RejectedReasonCounts.allTitle(counts), isOn: selected == nil) { onSelect(nil) }

                ForEach(RejectedCardReason.allCases) { reason in
                    chip(RejectedReasonCounts.chipTitle(reason, counts: counts), isOn: selected == reason) { onSelect(reason) }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
    }

    private func chip(_ title: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isOn ? Color.accentColor.opacity(0.2) : Color.secondary.opacity(0.12), in: Capsule())
                .overlay(Capsule().stroke(isOn ? Color.accentColor : .clear, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

struct RejectedNoteText: View {
    let card: RejectedCard
    @State private var expanded = false

    var body: some View {
        if let note = card.noteText {
            Button { expanded.toggle() } label: {
                Text(note)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(expanded ? nil : 2)
                    .multilineTextAlignment(.leading)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Your note: \(note)")
            .accessibilityHint(expanded ? "Double tap to show less" : "Double tap to show more")
            .accessibilityIdentifier("rejected-card-note-\(card.id)")
        }
    }
}
