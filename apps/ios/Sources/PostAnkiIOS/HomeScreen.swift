import PostAnkiAPI
import SwiftUI

struct HomeScreen: View {
    @State private var model = HomeScreenModel()
    @State private var dueModel = DueTodayModel()
    @State private var summaryModel = HomeSummaryModel()
    @State private var showsProgress = false
    @State private var showsAnswerPractice = false

    var body: some View {
        NavigationStack {
            List {
                HomeSummarySection(model: summaryModel)

                Section { DueTodayRow(model: dueModel) }

                HomeDailySection()

                if let curriculumName = model.curriculumName {
                    Section("Continue studying") {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(curriculumName)
                                .font(.headline)

                            if let topicCount = model.detail?.modules
                                .flatMap({ $0.topics }).count {
                                Text("\(topicCount) topics")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        NavigationLink {
                            ExerciseScreen(topics: model.topics)
                        } label: {
                            Label("Study now", systemImage: "play.fill")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(model.topics.isEmpty)
                    }
                } else if !model.isLoading {
                    ContentUnavailableView(
                        "No course yet",
                        systemImage: "book.closed",
                        description: Text("Open a course from the Courses tab to see it here.")
                    )
                }

                if let errorMessage = model.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }

                Section {
                    NavigationLink {
                        IngestionDictationScreen()
                    } label: {
                        Label("Add knowledge", systemImage: "square.and.pencil")
                    }
                }

                Section("Progress and practice") {
                    Button {
                        showsProgress = true
                    } label: {
                        Label("Progress", systemImage: "chart.bar")
                    }

                    Button {
                        showsAnswerPractice = true
                    } label: {
                        Label("Answer practice", systemImage: "tray.and.arrow.down")
                    }
                }

                HomePracticeSection()
                HomeStudyToolsSection()
                HomeStudyModesSection()
            }
            .navigationTitle("Home")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        SettingsScreen()
                    } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityLabel("Settings")
                }
            }
            .refreshable {
                async let course: Void = model.load()
                async let due: Void = dueModel.load()
                async let summary: Void = summaryModel.load()
                await course
                await due
                await summary
            }
            .task {
                async let course: Void = model.load()
                async let summary: Void = summaryModel.load()
                await course
                await summary
            }
            .sheet(isPresented: $showsProgress) { ProgressScreen() }
            .sheet(isPresented: $showsAnswerPractice) { IngestScreen() }
        }
    }
}
