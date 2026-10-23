import PostAnkiAPI
import SwiftUI

@MainActor
final class MacDecideStore {
    static let shared = MacDecideStore()

    let model: DecideModel
    private var scopeObserver: ServerScopeObserver?

    init(
        model: DecideModel = DecideModel(),
        notificationCenter: NotificationCenter = .default,
        scopeProvider: @escaping () -> String = { ServerScope.current }
    ) {
        self.model = model
        scopeObserver = ServerScopeObserver(
            notificationCenter: notificationCenter,
            scopeProvider: scopeProvider
        ) { model.reset() }
    }
}

enum MacDecideRoute: Hashable {
    case history
    case session(DecideSession)
}

struct MacDecideView: View {
    @Environment(\.zoomScale) private var zoomScale

    private var zoom: CGFloat { CGFloat(zoomScale) }

    @State private var model = MacDecideStore.shared.model
    @State private var decisionClipped = false
    @State private var opinionClipped = false
    @State private var history = MacHistoryCenter.shared.stack(for: "decide", of: MacDecideRoute.self)

    var body: some View {
        NavigationStack(path: history.pathBinding) {
            screen
                .navigationDestination(for: MacDecideRoute.self) { route in
                    switch route {
                    case .history:
                        MacDecideHistoryView { history.push(.session($0)) }
                    case .session(let session):
                        DecideSessionDetailScreen(session: session).id(session.id)
                    }
                }
        }
    }

    private static func clipNoteState(_ text: String, was: Bool) -> Bool {
        if text.count > UnsentDraftStore.maxCharacters { return true }

        return was && text.count == UnsentDraftStore.maxCharacters
    }

    private var screen: some View {
        @Bindable var model = model

        return Group {
            if let session = model.session {
                List {
                    DecideSessionView(
                        session: session,
                        resolving: model.resolving,
                        message: model.spotMessage
                    ) { id, accepted in
                        Task { await model.resolve(spotId: id, accepted: accepted) }
                    }
                }
            } else {
                Form {
                Section("Decision") {
                    TextField(
                        "e.g. Should we move sessions from JWTs to server-side sessions?",
                        text: $model.decision,
                        axis: .vertical
                    )
                    .lineLimit(3...8)

                    if decisionClipped { DraftClippedNote() }
                }

                Section("Where you lean") {
                    TextField(
                        "Say where you currently lean and your reasoning.",
                        text: $model.opinion,
                        axis: .vertical
                    )
                    .lineLimit(4...12)

                    if opinionClipped { DraftClippedNote() }
                }

                if let errorMessage = model.errorMessage {
                    Text(errorMessage).foregroundStyle(.red)
                }
                }
                .formStyle(.grouped)
            }
        }
        .navigationTitle("Challenge my thinking")
        .onChange(of: model.decision) {
            decisionClipped = Self.clipNoteState(model.decision, was: decisionClipped)
            model.decision = UnsentDraftStore.clip(model.decision)
        }
        .onChange(of: model.opinion) {
            opinionClipped = Self.clipNoteState(model.opinion, was: opinionClipped)
            model.opinion = UnsentDraftStore.clip(model.opinion)
        }
        .reportsUnsentInput("decide", model.hasInput)
        .toolbar {
            ToolbarItem {
                if model.session == nil {
                    Button { Task { await model.submit() } } label: {
                        if model.isSubmitting {
                            ProgressView().controlSize(.small)
                        } else {
                            Label("Challenge my thinking", systemImage: "bolt")
                        }
                    }
                    .keyboardShortcut(.return, modifiers: .command)
                    .disabled(!model.canSubmit)
                } else {
                    Button { model.reset() } label: {
                        Label("New decision", systemImage: "square.and.pencil")
                    }
                }
            }

            ToolbarItem {
                NavigationLink(value: MacDecideRoute.history) {
                    Label("History", systemImage: "clock.arrow.circlepath")
                }
            }
        }
    }
}

struct MacDecideHistoryView: View {
    @Environment(\.zoomScale) private var zoomScale
    private var zoom: CGFloat { CGFloat(zoomScale) }

    @State private var model = DecideHistoryModel()
    @State private var selection: DecideSession.ID?
    let onOpen: (DecideSession) -> Void

    var body: some View {
        content
            .navigationTitle("History")
            .toolbar {
                ToolbarItem {
                    Button { Task { await model.load() } } label: {
                        Label("Reload", systemImage: "arrow.clockwise")
                    }
                    .keyboardShortcut("r", modifiers: .command)
                    .disabled(model.isLoading)
                }
            }
            .task { await model.load() }
    }

    @ViewBuilder
    private var content: some View {
        if !model.hasLoaded, model.errorMessage != nil {
            MacLoadStateView(failure: model.failureKind ?? .other, detail: model.errorMessage) {
                Task { await model.load() }
            }
        } else if !model.hasLoaded {
            ProgressView()
        } else if model.sessions.isEmpty {
            MacEmptyStateView(
                title: "No decisions yet",
                systemImage: "scale.3d",
                message: "Challenge a decision and it will be listed here."
            )
        } else {
            Table(model.sessions, selection: $selection) {
                TableColumn("Decision") { Text($0.decision).lineLimit(2) }

                TableColumn("Blind spots") { Text("\($0.blindSpots.count)") }
                    .width(90 * zoom)

                TableColumn("Date") { Text(DueReviewModel.nextDueText($0.createdAt) ?? "") }
                    .width(140 * zoom)
            }
            .contextMenu(forSelectionType: DecideSession.ID.self) { _ in
            } primaryAction: { ids in
                if let session = model.sessions.first(where: { ids.contains($0.id) }) { onOpen(session) }
            }
        }
    }
}
