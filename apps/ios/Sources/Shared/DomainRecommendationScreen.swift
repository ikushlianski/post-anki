import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class DomainRecommendationModel {
    let subjectId: String
    var items: [DomainRecommendation] = []
    var isLoading = false
    var hasLoaded = false
    var isRunning = false
    var errorMessage: String?
    var notice: String?
    var createdCourse: Curriculum?

    init(subjectId: String) {
        self.subjectId = subjectId
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            items = try await APIClient.domainRecommendations(subjectId: subjectId).filter { $0.status == "pending" }
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = DomainMapError.message(for: error)
        }
    }

    func generate() async {
        notice = nil
        isRunning = true
        defer { isRunning = false }

        do {
            try await APIClient.runDomainRecommendations(subjectId: subjectId)
        } catch {
            notice = DomainMapError.message(for: error)
        }

        await load()
    }

    func reject(_ item: DomainRecommendation) async {
        notice = nil

        do {
            _ = try await APIClient.resolveDomainRecommendation(id: item.id, accepted: false)
        } catch {
            notice = DomainMapError.message(for: error)
        }

        await load()
    }

    func accept(_ item: DomainRecommendation) async {
        notice = nil

        do {
            let result = try await APIClient.resolveDomainRecommendation(id: item.id, accepted: true)

            notice = "Subject created."

            if let courseId = result.createdCurriculumId {
                createdCourse = try? await APIClient.listCurricula().first { $0.id == courseId }
            }
        } catch {
            notice = DomainMapError.message(for: error)
        }

        await load()
    }
}

struct DomainRecommendationScreen: View {
    let names: [String: String]

    @State private var model: DomainRecommendationModel
    @State private var confirmGenerate = false
    @State private var acceptTarget: DomainRecommendation?
    @State private var opened: Curriculum?

    init(subjectId: String, names: [String: String]) {
        _model = State(initialValue: DomainRecommendationModel(subjectId: subjectId))
        self.names = names
    }

    var body: some View {
        List {
            if let notice = model.notice {
                Text(notice).foregroundStyle(.secondary)
            }

            if let course = model.createdCourse {
                Button("Open subject \(course.name)") { opened = course }
            }

            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
                Button("Try again") { Task { await model.load() } }
            } else if model.isLoading && !model.hasLoaded {
                ProgressView()
            }

            Section {
                Button("Get recommendations") { confirmGenerate = true }
                    .disabled(model.isRunning)

                if model.isRunning { ProgressView() }
            }

            Section("What to learn next") {
                if model.hasLoaded && model.items.isEmpty {
                    Text("No pending recommendations.").foregroundStyle(.secondary)
                }

                ForEach(model.items) { item in
                    ZoomVStack(alignment: .leading, spacing: 6) {
                        Text(names[item.domainNodeId] ?? "(removed)").zoomFont(.headline)
                        Text(item.axisLabel).zoomFont(.subheadline)
                        Text(item.reason).zoomFont(.caption).foregroundStyle(.secondary)

                        TriageButtons(
                            accept: { acceptTarget = item },
                            reject: { Task { await model.reject(item) } }
                        )
                    }
                }
            }
        }
        .navigationTitle("What to learn next")
        .navigationDestination(item: $opened) { CurriculumDetailScreen(curriculum: $0) }
        .confirmationDialog("This uses an AI call.", isPresented: $confirmGenerate, titleVisibility: .visible) {
            Button("Get recommendations") { Task { await model.generate() } }
        }
        .confirmationDialog(
            "Accepting creates a new subject for \(acceptTarget.flatMap { names[$0.domainNodeId] } ?? "this area").",
            isPresented: Binding(get: { acceptTarget != nil }, set: { if !$0 { acceptTarget = nil } }),
            titleVisibility: .visible
        ) {
            Button("Accept and create subject") {
                guard let item = acceptTarget else { return }

                Task { await model.accept(item) }
            }
        }
        #if os(macOS)
        .toolbar {
            ToolbarItem {
                Button { Task { await model.load() } } label: { Label("Reload", systemImage: "arrow.clockwise") }
                    .keyboardShortcut("r", modifiers: .command)
                    .disabled(model.isLoading)
            }
        }
        #endif
        .refreshable { await model.load() }
        .task { await model.load() }
    }
}
