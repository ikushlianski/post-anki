import PostAnkiAPI
import SwiftUI

struct DailyPushScreen: View {
    @State private var model: DailyPushModel

    init(model: DailyPushModel = DailyPushModel()) {
        _model = State(initialValue: model)
    }

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
                Button("Try again") { Task { await model.load() } }
            }

            if let message = model.openMessage {
                Text(message).foregroundStyle(.red)
            }

            if model.isLoading && !model.hasLoaded {
                ProgressView()
            } else if model.hasLoaded {
                todaySection
                queueSection
            }
        }
        .navigationTitle("Start your day")
        .inlineNavigationTitle()
        .navigationDestination(item: $model.openedTopic) { TopicStudyScreen(topic: $0) }
        .refreshable { await model.load() }
        .task { await model.load(keepResult: true) }
    }

    @ViewBuilder
    private var todaySection: some View {
        Section("Today's question") {
            if let push = model.push {
                ZoomVStack(alignment: .leading, spacing: 4) {
                    Text(push.topicTitle).zoomFont(.headline)
                    Text(push.curriculumName).zoomFont(.subheadline).foregroundStyle(.secondary)
                    Text(push.gap.label).zoomFont(.subheadline)
                }

                if let question = model.question {
                    Text(question.prompt)

                    TextField("Your answer", text: $model.answer, axis: .vertical)
                        .lineLimit(3...8)
                        .disabled(model.result != nil || model.isSubmitting)

                    if model.result == nil {
                        Button(model.isSubmitting ? "Submitting..." : "Submit") {
                            Task { await model.submit() }
                        }
                        .disabled(!model.canSubmit)
                        .submitShortcut()
                    }
                }

                if let result = model.result {
                    resultView(result)
                }

                Button("Open topic") { Task { await model.open(push) } }
            } else {
                Text("Nothing picked for today. You're up to date.").foregroundStyle(.secondary)
            }
        }
    }

    private func resultView(_ result: TopicProbeResult) -> some View {
        ZoomVStack(alignment: .leading, spacing: 4) {
            Text(result.outcome == "pass" ? "Passed" : "Not quite")
                .zoomFont(.headline)
                .foregroundStyle(result.outcome == "pass" ? .green : .orange)

            Text(result.feedback)

            if !result.coveredGapLabels.isEmpty {
                Text("Covered: \(result.coveredGapLabels.joined(separator: ", "))")
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var queueSection: some View {
        Section("Due queue") {
            if model.visibleQueue.isEmpty {
                Text("Nothing else is due.").foregroundStyle(.secondary)
            }

            ForEach(model.visibleQueue) { pick in
                Button { Task { await model.open(pick) } } label: {
                    ZoomVStack(alignment: .leading, spacing: 2) {
                        Text(pick.topicTitle).zoomFont(.headline)
                        Text(pick.curriculumName).zoomFont(.subheadline).foregroundStyle(.secondary)
                        Text(pick.gap.label).zoomFont(.subheadline)
                        Text(pick.reasonLabel).zoomFont(.caption).foregroundStyle(.secondary)
                    }
                }
                .foregroundStyle(.primary)
            }
        }
    }
}

extension View {
    @ViewBuilder
    func submitShortcut() -> some View {
#if os(macOS)
        keyboardShortcut(.return, modifiers: .command)
#else
        self
#endif
    }
}
