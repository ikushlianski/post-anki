import SwiftUI

struct MacDuplicatesView: View {
    private enum Kind: String, CaseIterable, Identifiable {
        case sources = "Sources"
        case subjects = "Subjects"

        var id: String { rawValue }
    }

    @State private var model = DuplicateReviewModel()
    @State private var kind = Kind.sources
    @State private var confirmScan = false

    var body: some View {
        content
            .navigationTitle("Duplicates")
            .toolbar {
                ToolbarItem {
                    Picker("Kind", selection: $kind) {
                        ForEach(Kind.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }

                ToolbarItem {
                    Button { confirmScan = true } label: {
                        Label("Scan", systemImage: "sparkle.magnifyingglass")
                    }
                    .disabled(model.isScanning)
                }

                ToolbarItem {
                    MacReloadButton(isDisabled: model.isLoading) { Task { await model.load() } }
                }
            }
            .confirmationDialog("This uses an AI call.", isPresented: $confirmScan, titleVisibility: .visible) {
                Button("Scan") {
                    Task { kind == .subjects ? await model.scanSubjects() : await model.scanSources() }
                }
            }
            .task { await model.load() }
    }

    @ViewBuilder
    private var content: some View {
        if !model.hasLoaded, let message = model.errorMessage {
            MacLoadStateView(failure: model.failureKind ?? .other, detail: message) {
                Task { await model.load() }
            }
        } else if !model.hasLoaded {
            ProgressView()
        } else {
            VStack(spacing: 0) {
                MacLibraryErrorBanner(message: model.errorMessage)

                if model.isScanning {
                    HStack {
                        ProgressView().controlSize(.small)
                        Text("Scanning...")
                    }
                    .zoomPadding(8)
                }

                if let notice = model.notice {
                    Text(notice).zoomFont(.caption).foregroundStyle(.secondary).zoomPadding(8)
                }

                List {
                    if kind == .subjects {
                        SubjectDuplicateList(model: model)
                    } else {
                        SourceDuplicateList(model: model)
                    }
                }
            }
        }
    }
}
