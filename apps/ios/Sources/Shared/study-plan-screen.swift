import PostAnkiAPI
import SwiftUI

struct StudyPlanScreen: View {
    let subjectId: String
    var title = "Study plan"

    @State private var model: StudyPlanModel

    init(subjectId: String, title: String = "Study plan") {
        self.subjectId = subjectId
        self.title = title
        _model = State(initialValue: StudyPlanModel(subjectId: subjectId))
    }

    var body: some View {
        content
            .navigationTitle(title)
            .navigationBarTitleDisplayModeInline()
            .task { await model.load() }
    }

    @ViewBuilder
    private var content: some View {
        if let options = model.options, model.draft != nil {
            Form {
                settings(options)
                saveSection
                StudyPlanStatsSection(forecast: model.forecast, message: model.forecastMessage)
            }
            .refreshable { await model.load() }
        } else if let message = model.loadMessage {
            ContentUnavailableView {
                Label("Couldn't load", systemImage: "exclamationmark.triangle")
            } description: {
                Text(message).accessibilityIdentifier("study-plan-load-error")
            } actions: {
                Button("Try again") { Task { await model.load() } }
                    .accessibilityIdentifier("study-plan-retry")
            }
        } else {
            ProgressView().accessibilityIdentifier("study-plan-loading")
        }
    }

    private var draft: Binding<StudyPlanDraft> {
        Binding(
            get: { model.draft ?? StudyPlanDraft(intent: .inherit, examDate: nil, retentionPercent: nil, newCardsPerDay: nil) },
            set: { model.draft = $0 }
        )
    }

    @ViewBuilder
    private func settings(_ options: SubjectStudyOptions) -> some View {
        Section {
            Picker("Studying for", selection: draft.intent) {
                ForEach(StudyIntentChoice.allCases) { Text($0.title).tag($0) }
            }
            .accessibilityIdentifier("study-plan-intent")

            if draft.wrappedValue.intent == .exam {
                DatePicker(
                    "Exam date",
                    selection: examDate,
                    in: Date()...,
                    displayedComponents: .date
                )
                .accessibilityIdentifier("study-plan-exam-date")
            }
        } footer: {
            Text(intentFooter(options)).accessibilityIdentifier("study-plan-intent-source")
        }

        Section {
            Picker("Complexity", selection: complexityLevel) {
                Text("Inherit").tag(ComplexityLevel?.none)
                ForEach(ComplexityLevel.allCases) { Text($0.title).tag(ComplexityLevel?.some($0)) }
            }
            .accessibilityIdentifier("study-plan-complexity")

            if let preview = options.preview {
                Text("Next gap if Good: ~\(preview.goodDays) days, if Easy: ~\(preview.easyDays) days")
                    .accessibilityIdentifier("study-plan-complexity-preview")
            }
        } footer: {
            Text(complexityFooter(options)).accessibilityIdentifier("study-plan-complexity-source")
        }

        Section {
            Toggle("Use inherited value", isOn: inheritsRetention)
                .accessibilityIdentifier("study-plan-retention-inherit")

            if let percent = draft.wrappedValue.retentionPercent {
                Stepper(
                    "Desired retention: \(percent)%",
                    value: Binding(
                        get: { percent },
                        set: { draft.wrappedValue.retentionPercent = $0 }
                    ),
                    in: StudyPlanDraft.retentionRange
                )
                .accessibilityIdentifier("study-plan-retention")
            } else {
                Text("Desired retention: \(StudyPlanDraft.percent(options.effective.desiredRetention))%")
                    .accessibilityIdentifier("study-plan-retention-value")
            }
        } footer: {
            Text("\(source(options.sources.desiredRetention)) Higher means shorter gaps and more reviews. 90% keeps the standard schedule.")
                .accessibilityIdentifier("study-plan-retention-source")
        }

        Section {
            Toggle(autoLabel, isOn: autoNewCards)
                .accessibilityIdentifier("study-plan-new-auto")

            if let perDay = draft.wrappedValue.newCardsPerDay {
                Stepper(
                    "New cards per day: \(perDay)",
                    value: Binding(
                        get: { perDay },
                        set: { draft.wrappedValue.newCardsPerDay = $0 }
                    ),
                    in: StudyPlanDraft.newCardsRange
                )
                .accessibilityIdentifier("study-plan-new-per-day")
            }
        } footer: {
            Text(newCardsFooter(options)).accessibilityIdentifier("study-plan-new-source")
        }

        Section {
            Toggle("Use inherited value", isOn: inheritsReviews)
                .accessibilityIdentifier("study-plan-reviews-inherit")

            if let perDay = draft.wrappedValue.maxReviewsPerDay {
                Stepper(
                    value: Binding(
                        get: { perDay },
                        set: { draft.wrappedValue.maxReviewsPerDay = $0 }
                    ),
                    in: StudyPlanDraft.reviewsRange,
                    step: 10
                ) {
                    LabeledContent("Reviews per day", value: perDay == 0 ? "Unlimited" : "\(perDay)")
                }
                .accessibilityIdentifier("study-plan-reviews-per-day")
            } else if let effective = options.effective.maxReviewsPerDay {
                Text("Reviews per day: \(effective == 0 ? "Unlimited" : "\(effective)")")
                    .accessibilityIdentifier("study-plan-reviews-value")
            }
        } footer: {
            Text(reviewsFooter(options)).accessibilityIdentifier("study-plan-reviews-source")
        }

        Section {
            Picker("Card detail", selection: draft.detailLevel) {
                Text("Default (Standard)").tag(DetailLevel?.none)
                ForEach(DetailLevel.allCases) { Text($0.title).tag(DetailLevel?.some($0)) }
            }
            .accessibilityLabel("Card detail")
            .accessibilityIdentifier("study-plan-detail-level")

            Toggle("Show hints in review", isOn: hintsShown)
                .accessibilityLabel("Show hints in review")
                .accessibilityIdentifier("study-plan-hinting")
        } footer: {
            Text("Applies to cards made for this subject from now on. Hints appear next to blanks while reviewing.")
                .accessibilityIdentifier("study-plan-learning-footer")
        }
    }

    private var saveSection: some View {
        Section {
            if let message = model.saveMessage {
                Text(message).foregroundStyle(.red).accessibilityIdentifier("study-plan-save-error")
            }

            if model.justSaved && !model.hasChanges {
                Text("Saved.").foregroundStyle(.secondary).accessibilityIdentifier("study-plan-saved")
            }

            Button(model.isSaving ? "Saving..." : "Save") {
                Task { await model.save(today: StudyPlanDate.string(from: Date())) }
            }
            .disabled(!model.canSave)
            .accessibilityIdentifier("study-plan-save")

            if model.hasChanges {
                Button("Discard changes", role: .destructive) { model.discard() }
                    .accessibilityIdentifier("study-plan-discard")
            }
        }
    }

    private var examDate: Binding<Date> {
        Binding(
            get: { draft.wrappedValue.examDate.flatMap { StudyPlanDate.parse($0) } ?? Date() },
            set: { draft.wrappedValue.examDate = StudyPlanDate.string(from: $0) }
        )
    }

    private var inheritsRetention: Binding<Bool> {
        Binding(
            get: { draft.wrappedValue.retentionPercent == nil },
            set: { inherit in
                draft.wrappedValue.retentionPercent = inherit
                    ? nil
                    : model.options.map { StudyPlanDraft.percent($0.effective.desiredRetention) }
                        ?? StudyPlanDraft.defaultRetentionPercent

                if !inherit { draft.wrappedValue.complexityLevel = nil }
            }
        )
    }

    private var complexityLevel: Binding<ComplexityLevel?> {
        Binding(
            get: { draft.wrappedValue.complexityLevel },
            set: { level in
                draft.wrappedValue.complexityLevel = level
                draft.wrappedValue.retentionPercent = nil
            }
        )
    }

    private func complexityFooter(_ options: SubjectStudyOptions) -> String {
        guard let complexity = options.complexity else { return "Easy spaces reviews wider, Cram keeps them tighter." }

        let level = complexity.level == "custom" ? "Custom retention" : complexity.level.capitalized

        return "\(level). \(source(complexity.source)) Easy spaces reviews wider, Cram keeps them tighter."
    }

    private var autoNewCards: Binding<Bool> {
        Binding(
            get: { draft.wrappedValue.newCardsPerDay == nil },
            set: { auto in
                draft.wrappedValue.newCardsPerDay = auto
                    ? nil
                    : model.options?.effective.newCardsPerDay ?? StudyPlanDraft.defaultNewCardsPerDay
            }
        )
    }

    private var inheritsReviews: Binding<Bool> {
        Binding(
            get: { draft.wrappedValue.maxReviewsPerDay == nil },
            set: { inherit in
                draft.wrappedValue.maxReviewsPerDay = inherit
                    ? nil
                    : model.options?.effective.maxReviewsPerDay ?? StudyPlanDraft.defaultMaxReviewsPerDay
            }
        )
    }

    private var hintsShown: Binding<Bool> {
        Binding(
            get: { draft.wrappedValue.hintingEnabled ?? true },
            set: { draft.wrappedValue.hintingEnabled = $0 }
        )
    }

    private var autoLabel: String {
        draft.wrappedValue.intent == .exam ? "Auto (spread until the exam)" : "Use inherited value"
    }

    private func source(_ value: String) -> String {
        StudyPlanSource.text(source: value, subjectId: subjectId, names: model.subjectNames)
    }

    private func intentFooter(_ options: SubjectStudyOptions) -> String {
        let info = options.intent
        let kind = info.studyIntent == .exam ? "Exam" : "Long-term"
        let when = info.examDate.map { " on \(StudyPlanDate.display($0))" } ?? ""

        return "Currently \(kind)\(when). \(source(info.source))"
    }

    private func reviewsFooter(_ options: SubjectStudyOptions) -> String {
        let base = options.sources.maxReviewsPerDay.map(source) ?? "Using the app default."

        return "\(base) 0 means no limit for this subject. The app-wide daily limit still applies."
    }

    private func newCardsFooter(_ options: SubjectStudyOptions) -> String {
        let base = source(options.sources.newCardsPerDay)

        if draft.wrappedValue.newCardsPerDay == nil && draft.wrappedValue.intent == .exam {
            return "The app spreads new cards so they are done well before the exam."
        }

        return "\(base) A number from \(StudyPlanDraft.newCardsRange.lowerBound) to \(StudyPlanDraft.newCardsRange.upperBound) always wins over the automatic pace."
    }
}

private extension View {
    @ViewBuilder
    func navigationBarTitleDisplayModeInline() -> some View {
        #if os(iOS)
        navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }
}
