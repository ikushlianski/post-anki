import PostAnkiAPI
import SwiftUI

struct WritingCheckScreen: View {
    @State private var model: WritingCheckModel

    init(subject: PracticeSubject) {
        _model = State(initialValue: WritingCheckModel(subjectId: subject.id))
    }

    var body: some View {
        List {
            Section {
                TextField("Write something in English...", text: $model.text, axis: .vertical)
                    .lineLimit(5...15)

                Text("\(model.text.count)/\(WritingCheckModel.maxLength)")
                    .font(.caption)
                    .foregroundStyle(model.text.count > WritingCheckModel.maxLength ? .red : .secondary)

                Button {
                    Task { await model.check() }
                } label: {
                    if model.isChecking { ProgressView() } else { Text("Check") }
                }
                .disabled(!model.canCheck)

                if let errorMessage = model.errorMessage {
                    Text(errorMessage).foregroundStyle(.red)
                    Button("Try again") { Task { await model.loadHistory() } }
                }
            }

            if let latest = model.latest {
                Section("Result") { WritingCheckResult(check: latest) }
            }

            if !model.history.isEmpty {
                Section("Past checks") {
                    ForEach(model.history) { check in
                        DisclosureGroup {
                            WritingCheckResult(check: check)
                        } label: {
                            Text(check.text).lineLimit(2)
                        }
                    }
                }
            }
        }
        .navigationTitle("Check my writing")
        .inlineNavigationTitle()
        .refreshable { await model.loadHistory() }
        .task { await model.loadHistory() }
    }
}

struct WritingCheckResult: View {
    let check: WritingCheck

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(check.score)/10 - \(check.verdict)").font(.subheadline.bold())

            Text(check.feedback)

            ForEach(check.nativeAlternatives, id: \.self) { Text("\u{2022} \($0)") }
        }
    }
}
