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
                DueReviewBottomActionView(message: message) {
                    Button("Retry") {
                        Task { await model.load() }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
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
        DueReviewTapSurface(model: model) {
            ScrollView {
                if let card = model.current {
                    DueReviewCardBody(
                        model: model,
                        card: card,
                        showsGradeButtons: false,
                        answerInput: { EmptyView() },
                        revealedFooter: { EmptyView() },
                        unrevealed: { EmptyView() }
                    )
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            DueReviewBottomBar(model: model)
        }
    }
}

private struct DueReviewUnauthorizedView: View {
    let onRetry: () -> Void

    var body: some View {
        DueReviewBottomActionView(message: "Your session isn't authorized. Add or update your token in Settings.") {
            VStack(spacing: 8) {
                NavigationLink {
                    SettingsScreen()
                } label: {
                    Text("Open Settings")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button(action: onRetry) {
                    Text("Try again")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
        }
    }
}

private struct DueReviewBottomActionView<Actions: View>: View {
    let message: String
    @ViewBuilder let actions: () -> Actions

    var body: some View {
        Text(message)
            .multilineTextAlignment(.center)
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                actions()
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                    .background(.bar)
            }
    }
}

#Preview {
    NavigationStack {
        DueReviewScreen()
    }
}
