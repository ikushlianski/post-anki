import PostAnkiAPI
import SwiftUI

struct MacDueReviewView: View {
    @Environment(\.zoomScale) private var zoomScale

    private var zoom: CGFloat { CGFloat(zoomScale) }

    @State private var model = DueReviewModel()
    @State private var editingCard: ReviewCard?

    var body: some View {
        Group {
            switch model.state {
            case .loading:
                ProgressView("Loading cards...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .card:
                MacDueReviewCardView(model: model)
            case .empty:
                DueReviewEmptyView(model: model)
            case .error(let message):
                MacLoadStateView(failure: .other, detail: message) { Task { await model.load() } }
            case .unauthorized:
                MacLoadStateView(failure: .unauthorized) { Task { await model.load() } }
            }
        }
        .toolbar {
            ToolbarItem {
                MacReloadButton(isDisabled: model.isGrading || model.state == .loading) { Task { await model.load() } }
            }

            if model.state == .card, !model.isGrading, let card = model.current {
                ToolbarItem {
                    Button {
                        editingCard = card
                    } label: {
                        Label("Edit", systemImage: "pencil")
                    }
                }
            }

            if model.lastGraded != nil, model.state == .card || model.state == .empty || model.state == .loading || model.isErrorState {
                ToolbarItem {
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
            .frame(minWidth: 420 * zoom, minHeight: 360 * zoom)
        }
        .task { await model.loadIfNeeded() }
    }
}

private struct MacDueReviewCardView: View {
    let model: DueReviewModel
    @FocusState private var isCardFocused: Bool

    var body: some View {
        ScrollView {
            if let card = model.current {
                DueReviewCardBody(
                    model: model,
                    card: card,
                    answerInput: { EmptyView() },
                    revealedFooter: {
                        Text("Press 1 Again, 2 Hard, 3 Good, 4 Easy, or Space for Good")
                            .zoomFont(.footnote)
                            .foregroundStyle(.secondary)
                    },
                    unrevealed: {
                        Text("Press Space or Return to show the answer")
                            .zoomFont(.footnote)
                            .foregroundStyle(.secondary)
                    }
                )
            }
        }
        .focusable()
        .focusEffectDisabled()
        .focused($isCardFocused)
        .onKeyPress(keys: [.space, .return]) { _ in
            model.handleConfirmKey() ? .handled : .ignored
        }
        .onAppear { isCardFocused = true }
        .onChange(of: model.current?.id) { isCardFocused = true }
    }
}
