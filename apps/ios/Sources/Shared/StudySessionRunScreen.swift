import PostAnkiAPI
import SwiftUI

struct StudySessionRunScreen: View {
    @State private var model: StudySessionRunModel
    @State private var confirmsEnd = false

    init(sessionId: String, model: StudySessionRunModel? = nil) {
        _model = State(initialValue: model ?? StudySessionRunModel(sessionId: sessionId))
    }

    var body: some View {
        List {
            if let session = model.session {
                switch session.status {
                case "planned": plannedView(session)
                case "in_progress": runnerView(session)
                default: reviewView(session)
                }
            } else if !model.hasLoaded && model.errorMessage == nil {
                ProgressView()
            }

            if let message = model.errorMessage {
                Section {
                    Text(message).foregroundStyle(.red)
                    Button("Try again") {
                        Task { await retry() }
                    }
                }
            }
        }
        .navigationTitle("Study session")
        .inlineNavigationTitle()
        .toolbar {
            if model.session?.status == "in_progress" {
                ToolbarItem(placement: .primaryAction) {
                    Button("End now") { confirmsEnd = true }
                        .disabled(model.isBusy)
                }
            }
        }
        .confirmationDialog("End this session now?", isPresented: $confirmsEnd, titleVisibility: .visible) {
            Button("End now", role: .destructive) {
                Task { await model.end(userRequested: true) }
            }
        }
        .refreshable { await model.load() }
        .task { await model.load() }
    }

    private var isDraftEmpty: Bool {
        model.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func retry() async {
        if model.result != nil {
            await model.retryRecord()
        } else {
            await model.load()
        }
    }

    private func plannedView(_ session: StudySession) -> some View {
        Section {
            Text("\(session.plannedDurationMinutes) min planned")

            if let scheduled = session.scheduledFor, let text = DueReviewModel.nextDueText(scheduled) {
                Text(text).foregroundStyle(.secondary)
            }

            Button("Start session") { Task { await model.start() } }
                .buttonStyle(.borderedProminent)
                .disabled(model.isBusy)
        }
    }

    @ViewBuilder
    private func reviewView(_ session: StudySession) -> some View {
        Section("Review") {
            if session.status == "abandoned" {
                Text("Abandoned: no questions answered.")
            } else {
                let percent = session.questionsAnswered == 0
                    ? 0
                    : Int((Double(session.questionsCorrect) / Double(session.questionsAnswered) * 100).rounded())
                Text("\(session.plannedDurationMinutes) min planned")
                Text("Answered: \(session.questionsAnswered)")
                Text("Correct: \(session.questionsCorrect) (\(percent)%)")
            }
        }
    }

    @ViewBuilder
    private func runnerView(_ session: StudySession) -> some View {
        Section {
            if let start = model.startDate {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    timerBanner(start: start, planned: session.plannedDurationMinutes, now: context.date)
                }
            }
        }

        if let result = model.result {
            resultView(result)
        } else if let push = model.push {
            pushView(push)
        } else if !model.isBusy && model.errorMessage == nil {
            ProgressView()
        }
    }

    @ViewBuilder
    private func timerBanner(start: Date, planned: Int, now: Date) -> some View {
        let elapsed = max(0, Int(now.timeIntervalSince(start)) / 60)

        if elapsed >= planned {
            Text("Time's up")
                .zoomFont(.headline)
            Button("End session") { Task { await model.end(userRequested: false) } }
                .disabled(model.isBusy)
        } else {
            Text("\(elapsed)m of \(planned) min")
        }
    }

    @ViewBuilder
    private func pushView(_ push: StudySessionPush) -> some View {
        if let target = push.push {
            Section {
                Text("\(target.curriculumName) - \(target.topicTitle)")
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
                Text(target.gap.label).zoomFont(.headline)

                if let question = push.question {
                    Text(question.prompt)
                } else {
                    Text("Couldn't load a question right now.")
                        .foregroundStyle(.secondary)
                    Button("Skip") { Task { await model.skip() } }
                }
            }

            if let question = push.question {
                answerControls(question)
            }
        } else {
            Section {
                Text("Nothing to study for this focus right now.")
                    .foregroundStyle(.secondary)
                Button("End session") { Task { await model.end(userRequested: true) } }
            }
        }
    }

    @ViewBuilder
    private func answerControls(_ question: StudyPushQuestion) -> some View {
        if let options = question.options, !options.isEmpty {
            Section {
                ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                    Button(option) {
                        let outcome = index == question.correctAnswerIndex ? "pass" : "fail"
                        Task { await model.submit(answer: option, selfOutcome: outcome) }
                    }
                    .disabled(model.isBusy)
                }
            }
        } else {
            Section {
                TextField("Your answer", text: $model.draft, axis: .vertical)
                    .lineLimit(3...8)

                Button("I answered it well") {
                    Task { await model.submit(answer: model.draft, selfOutcome: "pass") }
                }
                .disabled(model.isBusy || isDraftEmpty)

                Button("I struggled") {
                    Task { await model.submit(answer: model.draft, selfOutcome: "fail") }
                }
                .disabled(model.isBusy || isDraftEmpty)
            }
        }
    }

    private func resultView(_ result: TopicProbeResult) -> some View {
        Section {
            Text(result.feedback)

            if !result.coveredGapLabels.isEmpty {
                Text("Covered: " + result.coveredGapLabels.joined(separator: ", "))
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
            }

            if model.errorMessage == nil {
                Button("Next") { Task { await model.next() } }
                    .disabled(model.isBusy)
            }
        }
    }
}
