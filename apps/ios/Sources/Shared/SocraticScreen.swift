import PostAnkiAPI
import SwiftUI

struct SocraticScreen: View {
    let topic: Topic
    @State private var model: SocraticModel
    @State private var confirmsRestart = false

    init(topic: Topic) {
        self.topic = topic
        _model = State(initialValue: SocraticModel(topicId: topic.id))
    }

    var body: some View {
        Group {
            if let reason = model.blockedReason {
                ContentUnavailableView("Not available yet", systemImage: "lock", description: Text(reason))
            } else {
                dialogue
            }
        }
        .navigationTitle(topic.title)
        .inlineNavigationTitle()
        .toolbar {
            if model.session != nil && !model.isFinished {
                ToolbarItem(placement: .primaryAction) {
                    Button("Finish") { Task { await model.finish() } }
                        .disabled(model.isSending)
                }
            }
        }
        .task { await model.start() }
        .sheet(isPresented: $model.showsSummary) {
            SocraticSummarySheet(summary: model.summary)
                .macSheetMinSize()
        }
        .confirmationDialog("Start again?", isPresented: $confirmsRestart, titleVisibility: .visible) {
            Button("Start again", role: .destructive) {
                Task { await model.start(regenerate: true) }
            }
        } message: {
            Text("This closes the current dialogue and begins a new one.")
        }
    }

    private var dialogue: some View {
        VStack(spacing: 0) {
            List {
                if model.isStarting && model.messages.isEmpty {
                    ProgressView()
                }

                if model.total > 0 {
                    Text("\(model.covered)/\(model.total) concepts, maturity \(Int((model.maturity * 100).rounded()))%")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                ForEach(model.messages) { message in
                    ChatMessageRow(entry: message.entry, assistantLabel: "Mentor")
                }

                if model.showsCheckpoint {
                    checkpointCard
                }

                if model.allCovered {
                    Text("You've covered every concept in this topic.")
                        .foregroundStyle(.secondary)
                }

                if model.isFinished || model.allCovered {
                    Button("Start again") { confirmsRestart = true }
                }

                if let message = model.errorMessage {
                    Text(message).foregroundStyle(.red)

                    if !model.hasStarted {
                        Button("Try again") { Task { await model.start() } }
                    }
                }
            }

            if model.currentTurn != nil && !model.isFinished {
                Divider()

                ChatComposerBar(
                    draft: $model.draft,
                    placeholder: "Your answer…",
                    isSending: model.isSending
                ) {
                    Task { await model.send() }
                }
            }
        }
    }

    private var checkpointCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Good checkpoint").font(.headline)

            if let concepts = model.checkpoint?.solidConcepts, !concepts.isEmpty {
                Text("Solid so far: " + concepts.joined(separator: ", "))
            }

            if let count = model.checkpoint?.exchangeCount {
                Text("\(count) exchanges").font(.caption).foregroundStyle(.secondary)
            }

            HStack {
                Button("Keep going") { model.showsCheckpoint = false }
                Button("Finish") { Task { await model.finish() } }
            }
            .buttonStyle(.bordered)
        }
    }
}

struct SocraticSummarySheet: View {
    let summary: SocraticSummary?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if let summary {
                    Section("Topic") {
                        Text(summary.topicTitle)

                        if let depth = summary.depth {
                            Text("Depth: \(depth)").foregroundStyle(.secondary)
                        }
                    }

                    if !summary.solidConcepts.isEmpty {
                        Section("Solid concepts") {
                            ForEach(summary.solidConcepts, id: \.self) { Text($0) }
                        }
                    }

                    if let gap = summary.mostRecentGap {
                        Section("Most recent gap") { Text(gap.label) }
                    }
                } else {
                    Text("Session ended.")
                }
            }
            .navigationTitle("Summary")
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
