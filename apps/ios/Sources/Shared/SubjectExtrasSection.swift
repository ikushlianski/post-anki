import PostAnkiAPI
import SwiftUI

struct SubjectExtrasSection: View {
    let subject: Subject

    var body: some View {
        Section("More for this subject") {
            NavigationLink {
                SubjectDomainDestination(subjectId: subject.id, kind: .priority)
            } label: {
                Label("Priority suggestions", systemImage: "list.number")
            }

            NavigationLink {
                SubjectDomainDestination(subjectId: subject.id, kind: .recommendations)
            } label: {
                Label("What to learn next", systemImage: "lightbulb")
            }

            NavigationLink {
                SubjectCategoryDestination(subjectId: subject.id)
            } label: {
                Label("Categories", systemImage: "folder")
            }
        }
    }
}

struct SubjectDomainDestination: View {
    enum Kind {
        case priority
        case recommendations
    }

    let subjectId: String
    let kind: Kind

    @State private var model = DomainMapModel()

    var body: some View {
        Group {
            if model.hasLoaded {
                switch kind {
                case .priority:
                    DomainPriorityScreen(subjectId: subjectId, names: model.nodeNames)
                case .recommendations:
                    DomainRecommendationScreen(subjectId: subjectId, names: model.nodeNames)
                }
            } else if let errorMessage = model.errorMessage {
                List {
                    Text(errorMessage).foregroundStyle(.red)
                    Button("Try again") { Task { await model.load() } }
                }
            } else {
                ProgressView()
            }
        }
        .task {
            model.subjectId = subjectId
            await model.load()
        }
    }
}

struct SubjectCategoryDestination: View {
    let subjectId: String

    @State private var subject: SubjectManageSubject?
    @State private var failed = false

    var body: some View {
        Group {
            if let subject {
                SubjectCategoryScreen(subject: subject)
            } else if failed {
                List {
                    Text("Couldn't load the categories.").foregroundStyle(.red)
                    Button("Try again") { Task { await load() } }
                }
            } else {
                ProgressView()
            }
        }
        .task { await load() }
    }

    private func load() async {
        failed = false

        do {
            subject = try await APIClient.manageSubjects().first { $0.id == subjectId }
            failed = subject == nil
        } catch {
            failed = true
        }
    }
}
