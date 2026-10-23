import PostAnkiAPI
import SwiftUI

enum MacPracticeRoute: Hashable {
    case practice(PracticeSubject)
    case phraseBank(PracticeSubject)
    case writingCheck(PracticeSubject)
}

struct MacLanguagePracticeView: View {
    @State private var model = PracticeSubjectsModel()
    @State private var history = MacHistoryCenter.shared.stack(for: "language-practice", of: MacPracticeRoute.self)

    var body: some View {
        NavigationStack(path: history.pathBinding) {
            content
                .task { await model.load() }
                .navigationDestination(for: MacPracticeRoute.self) { route in
                    switch route {
                    case .practice(let subject): MacPracticeView(subject: subject, onOpen: history.push)
                    case .phraseBank(let subject): MacPhraseBankView(subject: subject)
                    case .writingCheck(let subject): MacWritingCheckView(subject: subject)
                    }
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        if model.subjects.count == 1, let only = model.subjects.first {
            MacPracticeView(subject: only, onOpen: history.push)
        } else {
            list
        }
    }

    @ViewBuilder
    private var list: some View {
        Group {
            if !model.hasLoaded, let message = model.errorMessage {
                MacLoadStateView(failure: model.failureKind ?? .other, detail: message) {
                    Task { await model.load() }
                }
            } else if !model.hasLoaded {
                ProgressView()
            } else if model.subjects.isEmpty {
                MacEmptyStateView(
                    title: "No language practice subjects",
                    systemImage: "character.bubble",
                    message: "Create a language practice subject on the web, then reload."
                )
            } else {
                List(model.subjects) { subject in
                    NavigationLink(subject.name, value: MacPracticeRoute.practice(subject))
                }
                .safeAreaInset(edge: .top, spacing: 0) { MacLibraryErrorBanner(message: model.errorMessage) }
            }
        }
        .navigationTitle("Language practice")
        .toolbar {
            ToolbarItem {
                MacReloadButton(isDisabled: model.isLoading) { Task { await model.load() } }
            }
        }
    }
}

struct MacPracticeView: View {
    @State private var model: PracticeModel
    private let onOpen: (MacPracticeRoute) -> Void

    init(subject: PracticeSubject, onOpen: @escaping (MacPracticeRoute) -> Void) {
        self.onOpen = onOpen
        _model = State(initialValue: PracticeModelStore.shared.model(for: subject))
    }

    var body: some View {
        content
            .navigationTitle(model.subject.name)
            .toolbar {
                ToolbarItem {
                    Button { onOpen(.phraseBank(model.subject)) } label: {
                        Label("Phrase bank", systemImage: "books.vertical")
                    }
                }

                ToolbarItem {
                    Button { onOpen(.writingCheck(model.subject)) } label: {
                        Label("Check my writing", systemImage: "pencil.and.list.clipboard")
                    }
                }

                ToolbarItem {
                    MacReloadButton(isDisabled: model.isLoadingBatch) { Task { await reload() } }
                }
            }
            .alert("Discard this batch?", isPresented: Binding(
                get: { model.pendingChange != nil },
                set: { if !$0 { model.pendingChange = nil } }
            )) {
                Button("Discard", role: .destructive) {
                    if let change = model.pendingChange { Task { await model.apply(change) } }
                }
                Button("Keep", role: .cancel) { model.pendingChange = nil }
            } message: {
                Text("Your unsent answers will be lost.")
            }
            .task { await model.start() }
    }

    @ViewBuilder
    private var content: some View {
        if model.settings == nil, let message = model.errorMessage {
            MacLoadStateView(failure: model.failureKind ?? .other, detail: message) {
                Task { await model.start() }
            }
        } else if model.settings == nil {
            ProgressView()
        } else {
            list
        }
    }

    private var list: some View {
        List {
            settingsSection

            if let message = model.errorMessage {
                Section {
                    Text(message).foregroundStyle(.red)
                    Button("Try again") { Task { await retry() } }
                }
            }

            if model.isLoadingBatch {
                Section {
                    HStack {
                        ProgressView().controlSize(.small)
                        Text("Generating your next batch of phrases...")
                    }
                }
            }

            ForEach(model.masteredPhrases, id: \.self) { phrase in
                Label("Mastered: \(phrase)", systemImage: "checkmark.seal.fill")
                    .foregroundStyle(.green)
            }

            if !model.isLoadingBatch { phrasesSection }
        }
    }

    @ViewBuilder
    private var settingsSection: some View {
        if let settings = model.settings {
            Section {
                Picker("Level", selection: Binding(
                    get: { settings.level },
                    set: { model.requestChange(level: $0, pack: nil) }
                )) {
                    ForEach(PracticeOptions.levels, id: \.value) { Text($0.label).tag($0.value) }
                }

                Picker("Topic pack", selection: Binding(
                    get: { settings.pack },
                    set: { model.requestChange(level: nil, pack: $0) }
                )) {
                    ForEach(PracticeOptions.packs, id: \.value) { Text($0.label).tag($0.value) }
                }
            }
        }
    }

    @ViewBuilder
    private var phrasesSection: some View {
        if !model.chunk.isEmpty {
            Section("Translate to English") {
                ForEach(model.chunk) { phrase in
                    PhraseCardView(
                        phrase: phrase,
                        answer: Binding(
                            get: { model.answers[phrase.id] ?? "" },
                            set: { model.answers[phrase.id] = $0 }
                        ),
                        attempt: model.results[phrase.id],
                        onSubmit: { Task { await model.submit() } }
                    )
                }
            }

            Section {
                if model.chunkGraded {
                    Button(model.hasMoreChunks ? "Continue" : "Next batch") {
                        Task { await model.advance() }
                    }
                    .keyboardShortcut(.return, modifiers: [])
                } else {
                    Button {
                        Task { await model.submit() }
                    } label: {
                        if model.isSubmitting { ProgressView().controlSize(.small) } else { Text("Submit") }
                    }
                    .disabled(!model.canSubmit)
                }
            }
        }
    }

    private func retry() async {
        if model.settings == nil { await model.start() } else { await model.nextBatch() }
    }

    private func reload() async {
        if model.settings == nil { await model.start() } else { await model.loadSettings() }
    }
}
