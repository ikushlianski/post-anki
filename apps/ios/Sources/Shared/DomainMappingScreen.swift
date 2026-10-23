import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class DomainMappingModel {
    let curriculumId: String
    let subjectId: String
    var mappings: [CurriculumDomainMapping] = []
    var names: [String: String] = [:]
    var isLoading = false
    var hasLoaded = false
    var isRunning = false
    var errorMessage: String?
    var notice: String?

    init(curriculumId: String, subjectId: String) {
        self.curriculumId = curriculumId
        self.subjectId = subjectId
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            mappings = try await APIClient.domainMappings(curriculumId: curriculumId)

            if let tree = try? await APIClient.domainMap(subjectId: subjectId) {
                names = Dictionary(
                    DomainMapModel.flatten(tree).map { ($0.id, $0.name) },
                    uniquingKeysWith: { first, _ in first }
                )
            }

            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = DomainMapError.message(for: error)
        }
    }

    func resolve(_ mapping: CurriculumDomainMapping, confirmed: Bool, depth: String?) async {
        notice = nil

        do {
            try await APIClient.resolveDomainMapping(id: mapping.id, confirmed: confirmed, depth: depth)
        } catch {
            notice = DomainMapError.message(for: error)
        }

        await load()
    }

    func suggest() async {
        notice = nil
        isRunning = true
        defer { isRunning = false }

        do {
            try await APIClient.suggestDomainMappings(curriculumId: curriculumId)
        } catch {
            notice = DomainMapError.message(for: error)
        }

        await load()
    }
}

struct DomainMappingScreen: View {
    let courseName: String

    @State private var model: DomainMappingModel
    @State private var confirmSuggest = false
    @State private var depths: [String: String] = [:]

    init(curriculumId: String, courseName: String, subjectId: String) {
        _model = State(initialValue: DomainMappingModel(curriculumId: curriculumId, subjectId: subjectId))
        self.courseName = courseName
    }

    var body: some View {
        List {
            if let notice = model.notice {
                Text(notice).foregroundStyle(.secondary)
            }

            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
                Button("Try again") { Task { await model.load() } }
            } else if model.isLoading && !model.hasLoaded {
                ProgressView()
            } else if model.hasLoaded && model.mappings.isEmpty {
                Text("This course isn't placed in the map yet.").foregroundStyle(.secondary)
            }

            Section {
                Button("Suggest areas") { confirmSuggest = true }
                    .disabled(model.isRunning)

                if model.isRunning { ProgressView() }
            }

            ForEach(model.mappings) { mapping in
                ZoomVStack(alignment: .leading, spacing: 6) {
                    Text(model.names[mapping.domainNodeId] ?? "(removed)").zoomFont(.headline)

                    Text("\(mapping.status.capitalized), \(DomainDepth.label(mapping.depth))")
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)

                    if mapping.status == "suggested" {
                        Picker("Depth", selection: Binding(
                            get: { depths[mapping.id] ?? mapping.depth ?? "working" },
                            set: { depths[mapping.id] = $0 }
                        )) {
                            ForEach(DomainDepth.all, id: \.self) { Text(DomainDepth.label($0)).tag($0) }
                        }

                        HStack {
                            Button("Confirm") {
                                let depth = depths[mapping.id] ?? mapping.depth ?? "working"

                                Task { await model.resolve(mapping, confirmed: true, depth: depth) }
                            }
                            .buttonStyle(.borderedProminent)

                            Button("Reject") {
                                Task { await model.resolve(mapping, confirmed: false, depth: nil) }
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }
            }
        }
        .navigationTitle(courseName)
        .confirmationDialog("This uses an AI call.", isPresented: $confirmSuggest, titleVisibility: .visible) {
            Button("Suggest areas") { Task { await model.suggest() } }
        }
        .refreshable { await model.load() }
        .task { await model.load() }
    }
}
