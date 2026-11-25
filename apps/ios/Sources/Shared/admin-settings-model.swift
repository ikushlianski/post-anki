import Foundation
import PostAnkiAPI
import SwiftUI

enum AdminSettingField: Hashable {
    case modelTier
    case knowledgeItemModel
    case newCardsPerDay
    case maxReviewsPerDay
    case mixNewWithDue
    case triageEnabled
    case fusion
}

@Observable
@MainActor
final class AdminSettingsModel {
    typealias Loader = () async throws -> AdminSettings
    typealias Saver = (AdminSettingsUpdate) async throws -> AdminSettings

    var settings: AdminSettings?
    var isLoading = false
    var errorMessage: String?
    var failedField: AdminSettingField?
    var failedFields: Set<AdminSettingField> = []
    var refusalMessage: String?

    private var inFlight = AdminSettingsUpdate()
    private var inFlightFields: Set<AdminSettingField> = []
    private var unsent = AdminSettingsUpdate()
    private var unsentFields: Set<AdminSettingField> = []
    private var drainTask: Task<Void, Never>?
    private let loader: Loader
    private let saver: Saver

    init(
        loader: @escaping Loader = { try await APIClient.adminSettings() },
        saver: @escaping Saver = { try await APIClient.updateAdminSettings($0) }
    ) {
        self.loader = loader
        self.saver = saver
    }

    private var shown: AdminSettingsUpdate { inFlight.merged(with: unsent) }

    var modelTier: String { shown.modelTier ?? settings?.modelTier ?? "balanced" }
    var knowledgeItemModelId: String {
        shown.knowledgeItemModelId ?? settings?.knowledgeItemModelId ?? AdminExtractionModel.defaultId
    }
    var newCardsPerDay: Int {
        shown.newCardsPerDay ?? settings?.newCardsPerDay ?? AdminSettingsLimits.defaultNewCardsPerDay
    }
    var maxReviewsPerDay: Int {
        shown.maxReviewsPerDay ?? settings?.maxReviewsPerDay ?? AdminSettingsLimits.defaultMaxReviewsPerDay
    }
    var mixNewWithDue: Bool { shown.mixNewWithDue ?? settings?.mixNewWithDue ?? true }
    var triageEnabled: Bool { shown.triageEnabled ?? settings?.triageEnabled ?? false }

    var fusionEnabled: Bool { shown.fusionEnabled ?? settings?.fusionEnabled ?? false }
    var fusionModelIds: [String] { shown.fusionModelIds ?? settings?.fusionModelIds ?? [] }

    func hasFailed(_ field: AdminSettingField) -> Bool { failedFields.contains(field) }

    func settle() async {
        while let task = drainTask { await task.value }
    }

    func setFusionEnabled(_ value: Bool) {
        save(.fusion, AdminSettingsUpdate(fusionEnabled: value))
    }

    func toggleFusionModel(_ id: String) {
        let ids = FusionSelection.toggled(fusionModelIds, id: id)

        guard ids != fusionModelIds else { return }

        save(.fusion, AdminSettingsUpdate(fusionModelIds: ids))
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let loaded = try await loader()

            if drainTask == nil { settings = loaded }
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = StudyToolsError.message(for: error)
        }
    }

    func setModelTier(_ value: String) {
        save(.modelTier, AdminSettingsUpdate(modelTier: value))
    }

    func setKnowledgeItemModel(_ value: String) {
        save(.knowledgeItemModel, AdminSettingsUpdate(knowledgeItemModelId: value))
    }

    func setNewCardsPerDay(_ value: Int) {
        let clamped = min(AdminSettingsLimits.newCardsPerDay.upperBound, max(AdminSettingsLimits.newCardsPerDay.lowerBound, value))

        save(.newCardsPerDay, AdminSettingsUpdate(newCardsPerDay: clamped))
    }

    func setMaxReviewsPerDay(_ value: Int) {
        let range = AdminSettingsLimits.maxReviewsPerDay
        let clamped = min(range.upperBound, max(range.lowerBound, value))

        save(.maxReviewsPerDay, AdminSettingsUpdate(maxReviewsPerDay: clamped))
    }

    func setMixNewWithDue(_ value: Bool) {
        save(.mixNewWithDue, AdminSettingsUpdate(mixNewWithDue: value))
    }

    func setTriageEnabled(_ value: Bool) {
        save(.triageEnabled, AdminSettingsUpdate(triageEnabled: value))
    }

    private func save(_ field: AdminSettingField, _ update: AdminSettingsUpdate) {
        guard settings != nil else { return }

        failedField = nil
        failedFields = []
        refusalMessage = nil
        unsent = unsent.merged(with: update)
        unsentFields.insert(field)

        if drainTask == nil {
            drainTask = Task { [weak self] in await self?.drain() }
        }
    }

    private func drain() async {
        while !unsentFields.isEmpty {
            let batch = unsent
            let fields = unsentFields

            unsent = AdminSettingsUpdate()
            unsentFields = []
            inFlight = batch
            inFlightFields = fields

            do {
                let saved = try await saver(batch)

                inFlight = AdminSettingsUpdate()
                inFlightFields = []
                settings = saved
            } catch {
                inFlight = AdminSettingsUpdate()
                inFlightFields = []

                if error is CancellationError { continue }

                refusalMessage = (error as? AdminSettingsRefusal)?.message
                failedFields = fields
                failedField = fields.first
            }
        }

        drainTask = nil
    }
}

extension AdminSettingsUpdate {
    func merged(with newer: AdminSettingsUpdate) -> AdminSettingsUpdate {
        AdminSettingsUpdate(
            testToggle: newer.testToggle ?? testToggle,
            modelTier: newer.modelTier ?? modelTier,
            knowledgeItemModelId: newer.knowledgeItemModelId ?? knowledgeItemModelId,
            newCardsPerDay: newer.newCardsPerDay ?? newCardsPerDay,
            maxReviewsPerDay: newer.maxReviewsPerDay ?? maxReviewsPerDay,
            mixNewWithDue: newer.mixNewWithDue ?? mixNewWithDue,
            triageEnabled: newer.triageEnabled ?? triageEnabled,
            fusionEnabled: newer.fusionEnabled ?? fusionEnabled,
            fusionModelIds: newer.fusionModelIds ?? fusionModelIds
        )
    }
}
