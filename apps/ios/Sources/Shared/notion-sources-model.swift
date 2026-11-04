import Foundation
import PostAnkiAPI
import SwiftUI

struct NotionSourcesClient: Sendable {
    var list: @Sendable () async throws -> [NotionIngestionSource]
    var create: @Sendable (NotionSourceInput) async throws -> NotionIngestionSource
    var update: @Sendable (String, NotionSourceUpdate) async throws -> NotionIngestionSource
    var delete: @Sendable (String) async throws -> Void
    var run: @Sendable (String) async throws -> NotionRunResult

    static let live = NotionSourcesClient(
        list: { try await APIClient.notionSources() },
        create: { try await APIClient.createNotionSource($0) },
        update: { try await APIClient.updateNotionSource(id: $0, $1) },
        delete: { try await APIClient.deleteNotionSource(id: $0) },
        run: { try await APIClient.runNotionSource(id: $0) }
    )
}

enum NotionRunOutcome: Equatable {
    case result(NotionRunResult)
    case failure(String)
}

@Observable
@MainActor
final class NotionSourcesModel {
    var sources: [NotionIngestionSource] = []
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?
    var actionError: String?
    var saveError: String?
    var isSaving = false
    var busyIds: Set<String> = []
    var runningIds: Set<String> = []
    var outcomes: [String: NotionRunOutcome] = [:]
    var pendingDelete: NotionIngestionSource?

    private let client: NotionSourcesClient

    init(client: NotionSourcesClient = .live) {
        self.client = client
    }

    func isIngestDisabled(_ source: NotionIngestionSource) -> Bool {
        runningIds.contains(source.id) || busyIds.contains(source.id)
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        failureKind = nil
        defer { isLoading = false }

        do {
            sources = try await client.list()
            hasLoaded = true
        } catch {
            guard let kind = ProgressLoadError.from(error) else { return }

            failureKind = kind
            errorMessage = StudyToolsError.message(for: error)
        }
    }

    func save(_ form: NotionSourceFormModel) async -> Bool {
        saveError = nil

        guard form.canSave, !isSaving else { return false }

        isSaving = true
        defer { isSaving = false }

        do {
            if let id = form.editingId {
                replace(try await client.update(id, form.updateInput()))
            } else {
                sources.append(try await client.create(form.createInput()))
            }

            return true
        } catch {
            if error is CancellationError { return false }

            saveError = NotionSourceText.saveError(error)

            return false
        }
    }

    func togglePause(_ source: NotionIngestionSource) async {
        guard !busyIds.contains(source.id) else { return }

        actionError = nil
        busyIds.insert(source.id)
        defer { busyIds.remove(source.id) }

        do {
            replace(try await client.update(source.id, NotionSourceUpdate(paused: !source.paused)))
        } catch {
            if error is CancellationError { return }

            actionError = "Could not \(source.paused ? "resume" : "pause") the source. Try again."
        }
    }

    func setRemoveAfterImport(_ source: NotionIngestionSource, _ value: Bool) async {
        guard !busyIds.contains(source.id), source.removeAfterImport != value else { return }

        actionError = nil
        busyIds.insert(source.id)
        defer { busyIds.remove(source.id) }

        do {
            replace(try await client.update(source.id, NotionSourceUpdate(removeAfterImport: value)))
        } catch {
            if error is CancellationError { return }

            actionError = "Could not change the removal setting. Try again."
        }
    }

    func requestDelete(_ source: NotionIngestionSource) {
        pendingDelete = source
    }

    func cancelDelete() {
        pendingDelete = nil
    }

    func confirmDelete() async {
        guard let source = pendingDelete else { return }

        pendingDelete = nil
        actionError = nil
        busyIds.insert(source.id)
        defer { busyIds.remove(source.id) }

        do {
            try await client.delete(source.id)
            sources.removeAll { $0.id == source.id }
            outcomes[source.id] = nil
        } catch {
            if error is CancellationError { return }

            actionError = "Could not delete the source. Try again."
        }
    }

    func ingest(_ source: NotionIngestionSource) async {
        guard !isIngestDisabled(source) else { return }

        runningIds.insert(source.id)
        outcomes[source.id] = nil

        do {
            outcomes[source.id] = .result(try await client.run(source.id))
        } catch {
            if !(error is CancellationError) {
                outcomes[source.id] = .failure(NotionSourceText.runError(error))
            }
        }

        runningIds.remove(source.id)

        if let fresh = try? await client.list() { sources = fresh }
    }

    private func replace(_ source: NotionIngestionSource) {
        if let index = sources.firstIndex(where: { $0.id == source.id }) {
            sources[index] = source
        }
    }
}
