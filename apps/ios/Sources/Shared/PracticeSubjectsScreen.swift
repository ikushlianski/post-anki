import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class PracticeSubjectsModel {
    var subjects: [PracticeSubject] = []
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        failureKind = nil
        defer { isLoading = false }

        do {
            subjects = try await APIClient.listPracticeSubjects().filter { $0.kind == "language-practice" }
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = PracticeError.message(for: error)
            failureKind = ProgressLoadError.from(error)
        }
    }
}

struct PracticeSubjectsScreen: View {
    @State private var model = PracticeSubjectsModel()

    var body: some View {
        Group {
            if model.subjects.count == 1, let only = model.subjects.first {
                PracticeScreen(subject: only)
            } else {
                list
            }
        }
        .task { await model.load() }
    }

    private var list: some View {
        List {
            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
                Button("Try again") { Task { await model.load() } }
            } else if model.isLoading && !model.hasLoaded {
                ProgressView()
            } else if model.hasLoaded && model.subjects.isEmpty {
                Text("No language practice subjects. Create one on the web.")
                    .foregroundStyle(.secondary)
            }

            ForEach(model.subjects) { subject in
                NavigationLink(subject.name) { PracticeScreen(subject: subject) }
            }
        }
        .navigationTitle("Language practice")
        .refreshable { await model.load() }
    }
}
