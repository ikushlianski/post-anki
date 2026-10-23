import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class TopicNotesModel {
    let topicId: String
    var notes: [Note] = []
    var isLoading = false
    var errorMessage: String?

    init(topicId: String) {
        self.topicId = topicId
    }

    func load() async {
        isLoading = true
        errorMessage = nil

        do {
            notes = try await APIClient.topicNotes(topicId: topicId)
        } catch where ProgressLoadError.from(error) == nil {
            isLoading = false

            return
        } catch {
            errorMessage = StudyToolsError.message(for: error, notFound: "This topic was removed.")
        }

        isLoading = false
    }

    func insert(_ note: Note) {
        notes.insert(note, at: 0)
    }
}

struct TopicStudyScreen: View {
    let topic: Topic
    @State private var model: TopicNotesModel
    @State private var showsComposer = false

    init(topic: Topic) {
        self.topic = topic
        _model = State(initialValue: TopicNotesModel(topicId: topic.id))
    }

    var body: some View {
        List {
            Section("Study") {
                NavigationLink {
                    ExerciseScreen(topics: [topic])
                } label: {
                    Label("Practice", systemImage: "play.fill")
                }

                NavigationLink {
                    TopicChatScreen(topic: topic)
                } label: {
                    Label("Chat about this topic", systemImage: "text.bubble")
                }
            }

            TopicStudyModesSection(topic: topic)

            Section("Notes") {
                notesContent
            }

            TopicTagSection(topic: topic)
        }
        .navigationTitle(topic.title)
        .inlineNavigationTitle()
        .toolbar {
            #if os(macOS)
            ToolbarItem {
                Button {
                    Task { await model.load() }
                } label: {
                    Label("Reload", systemImage: "arrow.clockwise")
                }
                .keyboardShortcut("r", modifiers: .command)
                .disabled(model.isLoading)
            }
            #endif

            ToolbarItem(placement: .primaryAction) {
                Button {
                    showsComposer = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Add note")
                .help("Add note")
            }
        }
        .sheet(isPresented: $showsComposer) {
            NoteComposerSheet(topic: topic) { model.insert($0) }
        }
        .refreshable { await model.load() }
        .task { await model.load() }
    }

    @ViewBuilder
    private var notesContent: some View {
        if let errorMessage = model.errorMessage {
            Text(errorMessage)
                .foregroundStyle(.red)
            Button("Retry") { Task { await model.load() } }
        } else if model.isLoading && model.notes.isEmpty {
            ProgressView()
        } else if model.notes.isEmpty {
            Text("No notes yet. Tap + to add one.")
                .foregroundStyle(.secondary)
        } else {
            ForEach(model.notes) { note in
                NoteRow(note: note)
            }
        }
    }
}

struct NoteRow: View {
    let note: Note
    var showsKind = false

    private var kindLabel: String {
        switch note.nodeType {
        case "topic": "Topic note"
        case "gap": "Gap note"
        case "source": "Source note"
        default: "Note"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(note.body)
                .lineLimit(showsKind ? 3 : nil)

            HStack(spacing: 6) {
                if note.isHighlight {
                    Image(systemName: "star.fill")
                        .foregroundStyle(.yellow)
                        .accessibilityLabel("Highlight")
                }

                if showsKind {
                    Text(kindLabel)
                }

                if let date = DueReviewModel.nextDueText(note.createdAt) {
                    Text(date)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
    }
}
