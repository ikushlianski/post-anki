import PostAnkiAPI
import SwiftUI

struct TopicGapsScreen: View {
    let topic: Topic
    @State private var model: TopicGapsModel
    @State private var showsAdd = false

    init(topic: Topic) {
        self.topic = topic
        _model = State(initialValue: TopicGapsModel(topicId: topic.id))
    }

    var body: some View {
        List {
            if !model.hasLoaded && model.errorMessage != nil {
                ContentUnavailableView {
                    Label("Couldn't load gaps", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(model.errorMessage ?? "")
                } actions: {
                    Button("Try again") { Task { await model.load() } }
                }
            } else if !model.hasLoaded {
                ProgressView()
            } else {
                banner
                group("Open", model.open)
                group("Later", model.later)
                group("Dismissed", model.dismissed)
                group("Covered or skipped", model.closed)

                if model.gaps.isEmpty {
                    Text("No gaps for this topic yet.").foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Gaps")
        .inlineNavigationTitle()
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showsAdd = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Add gap")
                .help("Add gap")
            }
        }
        .sheet(isPresented: $showsAdd) {
            AddGapSheet { label, concern, wanted in
                SheetFailure.message(
                    await model.add(label: label, concern: concern, wanted: wanted),
                    model.errorMessage
                )
            }
            .macSheetMinSize(width: 420, height: 320)
        }
        .refreshable { await model.load() }
        .task { await model.load() }
    }

    @ViewBuilder
    private var banner: some View {
        if let message = model.errorMessage {
            Text(message).foregroundStyle(.red)
        } else if let notice = model.notice {
            Text(notice).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func group(_ title: String, _ gaps: [Gap]) -> some View {
        if !gaps.isEmpty {
            Section(title) {
                ForEach(gaps) { gap in
                    GapRow(gap: gap)
                        .disabled(model.busyIds.contains(gap.id))
                        .swipeActions(edge: .trailing) {
                            Button(gap.wanted ? "Unwant" : "Want") {
                                Task { await model.setWanted(gap, !gap.wanted) }
                            }
                            .tint(.yellow)

                            Button(gap.state == "open" ? "Skip" : "Reopen") {
                                Task { await model.setState(gap, gap.state == "open" ? "skipped" : "open") }
                            }
                            .tint(.gray)
                        }
                        .contextMenu {
                            ForEach(GapTriageAction.available(for: gap), id: \.self) { action in
                                Button(action.title) {
                                    Task { await model.triage(gap, action: action.rawValue) }
                                }
                            }
                        }
                }
            }
        }
    }
}
