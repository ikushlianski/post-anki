import SwiftUI

struct DuplicateReviewScreen: View {
    private enum Tab: String, CaseIterable {
        case subjects = "Subjects"
        case sources = "Sources"
    }

    @State private var model = DuplicateReviewModel()
    @State private var tab = Tab.subjects
    @State private var confirmScan = false

    var body: some View {
        List {
            Section {
                Picker("Kind", selection: $tab) {
                    ForEach(Tab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
            }

            if let notice = model.notice {
                Text(notice).foregroundStyle(.secondary)
            }

            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
                Button("Try again") { Task { await model.load() } }
            } else if model.isLoading && !model.hasLoaded {
                ProgressView()
            }

            if model.isScanning { ProgressView() }

            if tab == .subjects {
                SubjectDuplicateList(model: model)
            } else {
                SourceDuplicateList(model: model)
            }
        }
        .navigationTitle("Duplicates")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Scan") { confirmScan = true }
                    .disabled(model.isScanning)
            }
        }
        .confirmationDialog("This uses an AI call.", isPresented: $confirmScan, titleVisibility: .visible) {
            Button("Scan") {
                Task { tab == .subjects ? await model.scanSubjects() : await model.scanSources() }
            }
        }
        .refreshable { await model.load() }
        .task { await model.load() }
    }
}
