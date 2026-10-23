import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class PhraseBankModel {
    let subjectId: String
    var bank: PhraseBank?
    var isLoading = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?

    init(subjectId: String) {
        self.subjectId = subjectId
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        failureKind = nil
        defer { isLoading = false }

        do {
            bank = try await APIClient.phraseBank(subjectId: subjectId)
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = PracticeError.message(for: error)
            failureKind = ProgressLoadError.from(error)
        }
    }
}

struct PhraseBankScreen: View {
    @State private var model: PhraseBankModel

    init(subject: PracticeSubject) {
        _model = State(initialValue: PhraseBankModel(subjectId: subject.id))
    }

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
                Button("Try again") { Task { await model.load() } }
            } else if let bank = model.bank {
                if bank.active.isEmpty && bank.mastered.isEmpty {
                    Text("No phrases tracked yet.").foregroundStyle(.secondary)
                }

                section("Learning", bank.active)
                section("Mastered", bank.mastered)
            } else if model.isLoading {
                ProgressView()
            }
        }
        .navigationTitle("Phrase bank")
        .inlineNavigationTitle()
        .refreshable { await model.load() }
        .task { await model.load() }
    }

    @ViewBuilder
    private func section(_ title: String, _ entries: [PhraseBankEntry]) -> some View {
        if !entries.isEmpty {
            Section(title) {
                ForEach(entries) { entry in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.phraseText)

                        Text([entry.category, entry.statusLabel].compactMap { $0 }.joined(separator: " - "))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}
