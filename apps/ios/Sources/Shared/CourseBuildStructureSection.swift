import PostAnkiAPI
import SwiftUI

struct CourseBuildStructureSection: View {
    @Bindable var model: CourseBuildModel

    @State private var message = ""

    private var trimmed: String { message.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        Section("Conversation") {
            if model.turns.isEmpty {
                Text("Waiting for the first draft...").foregroundStyle(.secondary)
            }

            ForEach(model.turns) { turn in
                turnRow(turn)
            }

            if model.turnPending {
                HStack(spacing: 12) {
                    ProgressView()
                    Text("Working on it...")
                }
            }
        }

        if let snapshot = model.latestSnapshot {
            Section("Current outline") {
                ForEach(snapshot.modules, id: \.self) { module in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(module.title).font(.headline)

                        ForEach(module.topics, id: \.self) { topic in
                            Text(topicLine(topic)).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }

        if !model.pendingCandidates.isEmpty {
            Section("Extra sources found") {
                ForEach(model.pendingCandidates) { candidate in
                    Toggle(isOn: Binding(
                        get: { model.selectedCandidates.contains(candidate.id) },
                        set: { isOn in
                            if isOn { model.selectedCandidates.insert(candidate.id) }
                            else { model.selectedCandidates.remove(candidate.id) }
                        }
                    )) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(candidate.title).lineLimit(2)
                            Text(candidate.label).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }

                Button("Use selected") { Task { await model.useSelectedCandidates() } }
                    .disabled(model.selectedCandidates.isEmpty)

                Button("Skip these") { Task { await model.skipCandidates() } }
            }
        }

        Section("Ask for changes") {
            TextField("What should change?", text: $message, axis: .vertical)
                .lineLimit(2...6)

            Button("Send") {
                let text = trimmed

                Task {
                    if await model.sendTurn(text) { message = "" }
                }
            }
            .disabled(trimmed.isEmpty || model.turnPending)
        }

        Section {
            Button("Confirm structure") { Task { await model.confirmStructure() } }
                .disabled(model.turnPending || model.latestSnapshot == nil)
        }
    }

    private func topicLine(_ topic: CourseBuildSnapshotTopic) -> String {
        guard let depth = topic.suggestedDepth else { return topic.title }

        return "\(topic.title) (\(depth))"
    }

    @ViewBuilder
    private func turnRow(_ turn: CourseBuildTurn) -> some View {
        let isUser = turn.role == "user"

        VStack(alignment: isUser ? .trailing : .leading, spacing: 2) {
            Text(turn.message)
                .padding(8)
                .background(isUser ? Color.accentColor.opacity(0.15) : Color.secondary.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 10))

            if turn.status == "failed" {
                Text("That message failed.").font(.caption).foregroundStyle(.red)
            }
        }
        .frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading)
    }
}
