import PostAnkiAPI
import SwiftUI

struct PracticeScreen: View {
    @State private var model: PracticeModel

    init(subject: PracticeSubject) {
        _model = State(initialValue: PracticeModel(subject: subject))
    }

    var body: some View {
        List {
            settingsSection

            if let errorMessage = model.errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(.red)
                    Button("Try again") { Task { await retry() } }
                }
            }

            if model.isLoadingBatch {
                Section {
                    HStack {
                        ProgressView()
                        Text("Generating your next batch of phrases...")
                    }
                }
            }

            ForEach(model.masteredPhrases, id: \.self) { phrase in
                Label("Mastered: \(phrase)", systemImage: "checkmark.seal.fill")
                    .foregroundStyle(.green)
            }

            if !model.isLoadingBatch {
                phrasesSection
            }
        }
        .navigationTitle(model.subject.name)
        .inlineNavigationTitle()
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    NavigationLink("Phrase bank") { PhraseBankScreen(subject: model.subject) }
                    NavigationLink("Check my writing") { WritingCheckScreen(subject: model.subject) }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("More")
                .help("More")
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
        .refreshable { await model.loadSettings() }
        .task { await model.start() }
    }

    private func retry() async {
        if model.settings == nil { await model.start() } else { await model.nextBatch() }
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
                        attempt: model.results[phrase.id]
                    )
                }
            }

            Section {
                if model.chunkGraded {
                    Button(model.hasMoreChunks ? "Continue" : "Next batch") {
                        Task { await model.advance() }
                    }
                } else {
                    Button {
                        Task { await model.submit() }
                    } label: {
                        if model.isSubmitting { ProgressView() } else { Text("Submit") }
                    }
                    .disabled(!model.canSubmit)
                }
            }
        }
    }
}
