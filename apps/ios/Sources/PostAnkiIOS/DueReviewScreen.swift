import PostAnkiAPI
import SwiftUI

struct DueReviewScreen: View {
    @State private var model = DueReviewModel()
    @Environment(\.scenePhase) private var scenePhase
    @State private var editingCard: ReviewCard?

    @ViewBuilder
    private var content: some View {
        Group {
            switch model.state {
            case .loading:
                ProgressView("Loading cards...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .card:
                DueReviewCardView(model: model)
            case .empty:
                DueReviewEmptyView(model: model)
            case .error(let message):
                DueReviewMessageView(message: message, actionTitle: "Retry") {
                    Task { await model.load() }
                }
            case .unauthorized:
                DueReviewUnauthorizedView {
                    Task { await model.load() }
                }
            }
        }
    }

    private var showsCounts: Bool {
        model.state == .card || model.state == .empty
    }

    var body: some View {
        VStack(spacing: 0) {
            if showsCounts, let counts = model.remainingCounts {
                ReviewCountsStrip(counts: counts)
                    .padding(.horizontal)
                    .padding(.top, 8)
            }

            content
        }
        .toolbar {
            if model.state == .card, !model.isGrading, let card = model.current {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        editingCard = card
                    } label: {
                        Label("Edit", systemImage: "pencil")
                    }
                }
            }

            if model.lastGraded != nil, model.state == .card || model.state == .empty || model.state == .loading || model.isErrorState {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await model.undo() }
                    } label: {
                        Label("Undo", systemImage: "arrow.uturn.backward")
                    }
                    .disabled(model.isGrading || model.state == .loading)
                }
            }
        }
        .sheet(item: $editingCard) { card in
            QuestionVariantEditSheet(prompt: card.prompt, answer: card.answer) { prompt, answer in
                await model.editCurrent(prompt: prompt, answer: answer)
            }
        }
        .navigationTitle("Due today")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.loadIfNeeded() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await model.flushPending() }
            }
        }
    }
}

private struct DueReviewCardView: View {
    let model: DueReviewModel

    var body: some View {
        ScrollView {
            if let card = model.current {
                DueReviewCardBody(
                    model: model,
                    card: card,
                    answerInput: { EmptyView() },
                    revealedFooter: { EmptyView() },
                    unrevealed: {
                        Button {
                            model.reveal()
                        } label: {
                            Text("Show answer")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                    }
                )
            }
        }
    }
}

private struct DueReviewUnauthorizedView: View {
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text("Your session isn't authorized. Add or update your token in Settings.")
                .multilineTextAlignment(.center)

            NavigationLink("Open Settings") {
                SettingsScreen()
            }
            .buttonStyle(.borderedProminent)

            Button("Try again", action: onRetry)
                .buttonStyle(.bordered)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#Preview {
    NavigationStack {
        DueReviewScreen()
    }
}
