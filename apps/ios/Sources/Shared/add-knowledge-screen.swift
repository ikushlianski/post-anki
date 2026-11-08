import PostAnkiAPI
import SwiftUI

struct IngestionDictationScreen: View {
    @State private var model: IngestionDictationScreenModel

    init(topic: Topic? = nil, subjectId: String? = nil) {
        _model = State(initialValue: IngestionDictationScreenModel(topic: topic, subjectId: subjectId))
    }

    init(model: IngestionDictationScreenModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let topic = model.topic {
                    Text("Topic: \(topic.title)")
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                }

                AddKnowledgeComposer(
                    text: $model.text,
                    highlights: $model.highlights,
                    isSubmitting: model.isSubmitting,
                    onSubmit: { Task { await model.submit() } }
                )

                if model.showsSubjectPicker {
                    AddKnowledgeSubjectPicker(model: model.subjectPicker)
                }

                if model.showsTargetPhrases {
                    TargetPhrasesSection(phrases: $model.targetPhrases, isExpanded: $model.isPhrasesExpanded)
                }

                AddKnowledgeStatusBanner(
                    model: model,
                    onReview: { model.showReview = true },
                    onAddAnyway: { Task { await model.addAnyway() } }
                )
            }
            .padding()
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .refreshable { if model.showsSubjectPicker { await model.subjectPicker.load() } }
        .keyboardDismissal()
        .task { await model.loadSubjects() }
        .onDisappear { model.stopWatching() }
        .navigationTitle("Add Knowledge")
        .reportsUnsentInput("add-knowledge", model.hasInput)
        .sheet(isPresented: $model.showReview) {
            PendingReviewScreen(onDone: { model.showReview = false })
                #if os(iOS)
                .presentationDragIndicator(.visible)
                #else
                .frame(minWidth: 480, minHeight: 520)
                #endif
        }
    }
}
