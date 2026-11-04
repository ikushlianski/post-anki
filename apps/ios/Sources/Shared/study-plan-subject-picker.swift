import PostAnkiAPI
import SwiftUI

struct StudyPlanSubjectPicker: View {
    @State private var subjects: [Subject] = []
    @State private var hasLoaded = false
    @State private var message: String?

    var body: some View {
        Group {
            if !hasLoaded, let message {
                ContentUnavailableView {
                    Label("Couldn't load", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
            } else if !hasLoaded {
                ProgressView()
            } else if subjects.isEmpty {
                ContentUnavailableView("No subjects yet", systemImage: "folder")
            } else {
                List(subjects) { subject in
                    NavigationLink {
                        StudyPlanScreen(subjectId: subject.id, title: subject.name)
                    } label: {
                        Text(subject.name)
                    }
                }
                .iosRefreshable { await load() }
                .accessibilityIdentifier("study-plan-subject-list")
            }
        }
        .navigationTitle("Study plan")
        .task { await load() }
    }

    private func load() async {
        message = nil

        do {
            subjects = try await APIClient.listSubjects().sorted {
                $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }
            hasLoaded = true
        } catch {
            message = StudyPlanMessage.load(error)
        }
    }
}
