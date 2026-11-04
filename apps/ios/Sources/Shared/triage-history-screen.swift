import PostAnkiAPI
import SwiftUI

struct TriageHistoryScreen: View {
    @State private var model = TriageHistoryModel()

    var body: some View {
        List {
            Section {
                NavigationLink {
                    TriageRecentDecisionsScreen()
                } label: {
                    Label("Last 7 days of decisions", systemImage: "clock.arrow.circlepath")
                }
            }

            if let message = model.errorMessage, !model.hasLoaded {
                ContentUnavailableView {
                    Label("Couldn't load history", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try again") { Task { await model.load() } }
                }
            } else if !model.hasLoaded {
                ProgressView()
            } else if model.entries.isEmpty {
                Text("No finished triage sessions yet.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(model.entries) { entry in
                    NavigationLink {
                        TriageHistoryDetailScreen(sessionId: entry.id, title: Self.title(for: entry))
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Self.title(for: entry))
                            Text(entry.summary)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Triage history")
        .refreshable { await model.load() }
        .task { await model.load() }
    }

    static func title(for entry: TriageHistoryEntry) -> String {
        guard let date = entry.startedAt else { return "Triage session" }

        return date.formatted(date: .abbreviated, time: .shortened)
    }
}

struct TriageHistoryDetailScreen: View {
    let title: String

    @State private var model: TriageHistoryDetailModel

    init(sessionId: String, title: String) {
        self.title = title
        _model = State(initialValue: TriageHistoryDetailModel(sessionId: sessionId))
    }

    var body: some View {
        List {
            if let message = model.errorMessage, !model.hasLoaded {
                ContentUnavailableView {
                    Label("Couldn't load decisions", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try again") { Task { await model.load() } }
                }
            } else if !model.hasLoaded {
                ProgressView()
            } else if model.decisions.isEmpty {
                Text("No decisions in this session.")
                    .foregroundStyle(.secondary)
            } else {
                section("Rejected", model.rejected, symbol: "xmark.circle.fill", color: .red)
                section("Approved", model.approved, symbol: "checkmark.circle.fill", color: .green)
                section("Other", model.other, symbol: "circle.dashed", color: .secondary)
            }
        }
        .navigationTitle(title)
        .refreshable { await model.load() }
        .task { await model.load() }
    }

    @ViewBuilder
    private func section(_ name: String, _ items: [TriageDecisionRecord], symbol: String, color: Color) -> some View {
        if !items.isEmpty {
            Section("\(name) (\(items.count))") {
                ForEach(items) { record in
                    VStack(alignment: .leading, spacing: 4) {
                        Label {
                            Text(record.front ?? "Card")
                                .lineLimit(3)
                        } icon: {
                            Image(systemName: symbol).foregroundStyle(color)
                        }

                        if let note = record.note, !note.isEmpty {
                            Text(note)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }
}
