import PostAnkiAPI
import SwiftUI

struct MacDueReviewView: View {
    @Environment(\.zoomScale) private var zoomScale

    private var zoom: CGFloat { CGFloat(zoomScale) }

    @State private var model: DueReviewModel
    @State private var editRoute: DueReviewEditRoute?
    private let title: String

    init(scope: DueReviewScope? = nil, aheadDays: Int = 0) {
        _model = State(initialValue: DueReviewModel(scope: scope, aheadDays: aheadDays))
        title = scope?.title ?? "Review"
    }

    private var showsCounts: Bool {
        model.state == .card || model.state == .empty
    }

    var body: some View {
        VStack(spacing: 0) {
            if showsCounts, let counts = model.remainingCounts {
                ReviewCountsStrip(counts: counts)
                    .zoomPadding(.horizontal)
                    .zoomPadding(.top, 8)
            }

            if showsCounts, let text = GoalStreak.footnote(goal: model.dailyGoal, streak: model.goalStreak) {
                Text(text)
                    .zoomFont(.footnote)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .zoomPadding(.top, 4)
            }

            content
        }
        .navigationTitle(model.aheadLabel ?? title)
        .toolbar {
            toolbarContent
        }
        .saveFailurePrompt(
            model.saveFailure,
            onRetry: { Task { await model.retryFailedSave() } },
            onSkip: { Task { await model.skipFailedSave() } }
        )
        .sheet(item: $editRoute) { route in
            DueReviewEditSheet(model: model, route: route) { editRoute = nil }
            .frame(minWidth: 420 * zoom, minHeight: 360 * zoom)
        }
        .dueReviewChatSheet(model: model)
        .task { await model.loadIfNeeded() }
    }

    private var content: some View {
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
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem {
            MacReloadButton(isDisabled: model.isGrading || model.state == .loading) { Task { await model.load() } }
                .help("Reload cards (Command-R)")
        }

        if model.scope == nil {
            ToolbarItem {
                DueReviewRepeatOnlyToggle(model: model)
                    .help("Show only cards you have studied before")
            }
        }

        if model.state == .card, !model.isGrading, let card = model.current {
            ToolbarItem {
                Button {
                    Task { editRoute = await model.editRoute(for: card) }
                } label: {
                    Label("Edit", systemImage: "pencil")
                }
                .help("Edit this card")
            }

            ToolbarItem {
                DueReviewCardControlsMenu(model: model)
                    .help("Chat, bury or suspend this card")
            }
        }

        if model.lastGraded != nil, model.state == .card || model.state == .empty || model.state == .loading || model.isErrorState {
            ToolbarItem {
                Button {
                    Task { await model.undo() }
                } label: {
                    Label("Undo", systemImage: "arrow.uturn.backward")
                }
                .keyboardShortcut("z", modifiers: .command)
                .disabled(model.isGrading || model.state == .loading)
                .help("Undo the last grade (Command-Z)")
            }
        }
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
                    showsKeyHints: true,
                    showsProgress: true,
                    answerInput: { EmptyView() },
                    revealedFooter: {
                        MacKnownCardButton(model: model)

                        Text("Press 1 Again, 2 Hard, 3 Good, 4 Easy, or Space for Good. C chats about the card. S suspends the card. K marks it as already known")
                            .zoomFont(.footnote)
                            .foregroundStyle(.secondary)
                    },
                    unrevealed: {
                        ZoomVStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 12) {
                                Button("Show answer") { model.reveal() }
                                    .buttonStyle(.borderedProminent)
                                    .help("Show the answer (Space or Return)")

                                MacKnownCardButton(model: model)
                            }

                            Text("Press Space or Return to show the answer. C chats about the card. S suspends the card. K marks it as already known")
                                .zoomFont(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                )
            }
        }
        .focusable()
        .focusEffectDisabled()
        .focused($isCardFocused)
        .onReviewConfirmKey(isOverlayShown: { model.chatCard != nil }) {
            model.handleConfirmKey()
        }
        .onKeyPress(characters: CharacterSet(charactersIn: "sS")) { press in
            guard press.modifiers.isEmpty || press.modifiers == .shift, !model.isGrading else { return .ignored }

            Task { await model.suspendCurrent() }

            return .handled
        }
        .onKeyPress(characters: CharacterSet(charactersIn: "kK")) { press in
            guard press.modifiers.isEmpty || press.modifiers == .shift, !model.isGrading else { return .ignored }

            Task { await model.markCurrentKnown() }

            return .handled
        }
        .onKeyPress(characters: CharacterSet(charactersIn: "cC")) { press in
            guard press.modifiers.isEmpty || press.modifiers == .shift,
                  !model.isGrading,
                  model.chatCard == nil,
                  let card = model.current else { return .ignored }

            model.chatCard = card

            return .handled
        }
        .onAppear { isCardFocused = true }
        .onChange(of: model.current?.id) { isCardFocused = true }
        .onChange(of: model.chatCard == nil) { _, closed in
            if closed { isCardFocused = true }
        }
    }
}

private struct MacKnownCardButton: View {
    let model: DueReviewModel

    var body: some View {
        Button {
            Task { await model.markCurrentKnown() }
        } label: {
            Label("I already know it", systemImage: "checkmark.seal.fill")
        }
        .buttonStyle(.bordered)
        .tint(.green)
        .disabled(model.isGrading || model.current?.isRehearsal == true)
        .help("Hide this card for 6 to 12 months (K)")
        .accessibilityIdentifier("due-review-known")
    }
}
