import SwiftUI

struct TodaySubjectsSection: View {
    let model: TodaySubjectsModel

    var body: some View {
        Section {
            if model.subjects.isEmpty {
                Text(model.loadFailed ? "Couldn't load today's subjects." : "No subjects due today.")
                    .foregroundStyle(.secondary)
            }

            ForEach(model.subjects) { subject in
                TodaySubjectRow(model: model, subject: subject)
            }

            if let error = model.toggleError {
                Text(error).font(.footnote).foregroundStyle(.red)
            }
        } header: {
            HStack {
                Text("Today")
                Spacer()
                Text("\(model.totalRemaining) left").monospacedDigit()
            }
        }
    }
}

struct TodaySubjectRow: View {
    let model: TodaySubjectsModel
    let subject: TodaySubject

    private var isExpanded: Bool { model.expanded.contains(subject.id) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Button {
                    Task { await model.setSkipped(subject.id, skipped: !subject.isSkipped) }
                } label: {
                    Image(systemName: subject.isSkipped ? "square" : "checkmark.square.fill")
                        .imageScale(.large)
                        .foregroundStyle(subject.isSkipped ? Color.secondary : Color.accentColor)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(subject.isSkipped ? "Include \(subject.name) today" : "Skip \(subject.name) today")

                Text(subject.name).lineLimit(2)

                Spacer()

                Text("\(subject.todayCount)")
                    .monospacedDigit()
                    .strikethrough(subject.isSkipped)

                Button {
                    withAnimation { model.toggleExpanded(subject.id) }
                } label: {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .frame(width: 20, height: 20)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("\(isExpanded ? "Hide" : "Show") cards of \(subject.name)")
            }
            .foregroundStyle(subject.isSkipped ? .secondary : .primary)

            if isExpanded { cards }
        }
    }

    @ViewBuilder
    private var cards: some View {
        switch model.cards[subject.id] {
        case .loaded(let items) where items.isEmpty:
            Text("No cards to show.").font(.footnote).foregroundStyle(.secondary)
        case .loaded(let items):
            ForEach(items) { card in
                Text(card.front).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
            }
        case .failed:
            Button("Couldn't load cards. Retry") { Task { await model.loadCards(for: subject.id) } }
                .font(.footnote)
        case .loading, nil:
            ProgressView().controlSize(.small)
        }
    }
}
