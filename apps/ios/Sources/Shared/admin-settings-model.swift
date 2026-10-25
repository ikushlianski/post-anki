import Foundation
import PostAnkiAPI
import SwiftUI

enum AdminSettingField: Hashable {
    case modelTier
    case knowledgeItemModel
    case newCardsPerDay
    case testToggle
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
    var savingField: AdminSettingField?

    private let loader: Loader
    private let saver: Saver

    init(
        loader: @escaping Loader = { try await APIClient.adminSettings() },
        saver: @escaping Saver = { try await APIClient.updateAdminSettings($0) }
    ) {
        self.loader = loader
        self.saver = saver
    }

    var modelTier: String { settings?.modelTier ?? "balanced" }
    var knowledgeItemModelId: String { settings?.knowledgeItemModelId ?? AdminExtractionModel.defaultId }
    var newCardsPerDay: Int { settings?.newCardsPerDay ?? AdminSettingsLimits.defaultNewCardsPerDay }
    var testToggle: Bool { settings?.testToggle ?? false }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            settings = try await loader()
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = StudyToolsError.message(for: error)
        }
    }

    func setModelTier(_ value: String) async {
        await save(.modelTier, AdminSettingsUpdate(modelTier: value))
    }

    func setKnowledgeItemModel(_ value: String) async {
        await save(.knowledgeItemModel, AdminSettingsUpdate(knowledgeItemModelId: value))
    }

    func setNewCardsPerDay(_ value: Int) async {
        let clamped = min(AdminSettingsLimits.newCardsPerDay.upperBound, max(AdminSettingsLimits.newCardsPerDay.lowerBound, value))

        await save(.newCardsPerDay, AdminSettingsUpdate(newCardsPerDay: clamped))
    }

    func setTestToggle(_ value: Bool) async {
        await save(.testToggle, AdminSettingsUpdate(testToggle: value))
    }

    private func save(_ field: AdminSettingField, _ update: AdminSettingsUpdate) async {
        guard settings != nil else { return }

        failedField = nil
        savingField = field
        defer { savingField = nil }

        do {
            settings = try await saver(update)
        } catch {
            if error is CancellationError { return }

            failedField = field
        }
    }
}
