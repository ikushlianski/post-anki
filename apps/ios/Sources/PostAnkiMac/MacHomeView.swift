import PostAnkiAPI
import SwiftUI

struct MacHomeView: View {
    let onStudyNow: () -> Void
    let onOpenCourses: () -> Void

    @State private var model = HomeScreenModel()
    @State private var dueModel = DueTodayModel()
    @State private var summaryModel = HomeSummaryModel()

    var body: some View {
        content
            .navigationTitle("Home")
            .toolbar {
                ToolbarItem {
                    Button {
                        Task { await reload() }
                    } label: {
                        Label("Reload", systemImage: "arrow.clockwise")
                    }
                    .keyboardShortcut("r", modifiers: .command)
                    .disabled(isLoading)
                }
            }
            .task { await reload() }
    }

    @ViewBuilder
    private var content: some View {
        if let failure = fullScreenFailure {
            MacLoadStateView(failure: failure) { Task { await reload() } }
        } else {
            List {
                HomeSummarySection(model: summaryModel)

                dueSection

                continueSection
            }
        }
    }

    private var fullScreenFailure: ProgressLoadError? {
        guard dueModel.counts == nil, summaryModel.summary == nil, summaryModel.streak == nil,
              !isLoading, summaryModel.failure != nil,
              case .failed(let due) = dueModel.state else { return nil }

        switch due {
        case .offline: return .offline
        case .unauthorized: return .unauthorized
        case .other: return .other
        }
    }

    private var isLoading: Bool {
        model.isLoading || dueModel.state == .loading || summaryModel.isLoading
    }

    private func reload() async {
        async let course: Void = model.load()
        async let due: Void = dueModel.load()
        async let summary: Void = summaryModel.load()
        await course
        await due
        await summary
    }

    private var dueSection: some View {
        Section("Due today") {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    if let total = dueModel.total {
                        Text("\(total)")
                            .font(.largeTitle.bold())
                    } else if dueModel.state == .loading {
                        ProgressView()
                    }

                    Text(dueSubtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Button(action: onStudyNow) {
                    Label(dueModel.total == 0 ? "Nothing due" : "Study now", systemImage: "play.fill")
                        .font(.headline)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .keyboardShortcut(.defaultAction)
                .disabled((dueModel.total ?? 0) == 0)
            }
            .padding(.vertical, 4)
        }
    }

    private var dueSubtitle: String {
        if let counts = dueModel.counts {
            var parts: [String] = []

            if counts.review > 0 { parts.append("\(counts.review) review") }

            if counts.learning > 0 { parts.append("\(counts.learning) learning") }

            if counts.new > 0 { parts.append("\(counts.new) new") }

            return parts.isEmpty ? "Nothing due today" : parts.joined(separator: ", ")
        }

        if case .failed(let failure) = dueModel.state {
            switch failure {
            case .offline: return "Can't check offline"
            case .unauthorized: return "Add your access token in Settings"
            case .other: return "Couldn't load due reviews"
            }
        }

        return ""
    }

    private func continueStudying() {
        MacCourseOpenRequest.shared.curriculum = model.detail?.curriculum
        onOpenCourses()
    }

    @ViewBuilder
    private var continueSection: some View {
        if let name = model.curriculumName {
            Section("Continue studying") {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(name)
                            .font(.headline)

                        if model.detail != nil {
                            Text("\(model.topics.count) topics")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Spacer()

                    Button("Continue", action: continueStudying)
                }

                if let errorMessage = model.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }
        } else if !model.isLoading {
            ContentUnavailableView(
                "No course yet",
                systemImage: "book.closed",
                description: Text("Open a course from Courses to see it here.")
            )
        }
    }
}
