import PostAnkiAPI
import SwiftUI

struct AdminSettingsScreen: View {
    @State private var model: AdminSettingsModel
    @State private var draftCards = AdminSettingsLimits.defaultNewCardsPerDay
    @State private var cardsTask: Task<Void, Never>?

    init(model: AdminSettingsModel = AdminSettingsModel()) {
        _model = State(initialValue: model)
    }

    var body: some View {
        Form {
            if let errorMessage = model.errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(.red)
                    Button("Try again") { Task { await model.load() } }
                }
            } else if model.settings == nil {
                ProgressView()
            } else {
                settingsSections
            }
        }
        #if os(macOS)
        .formStyle(.grouped)
        #endif
        .navigationTitle("Admin settings")
        .refreshable { await model.load() }
        .task {
            await model.load()
            draftCards = model.newCardsPerDay
        }
    }

    @ViewBuilder
    private var settingsSections: some View {
        Section {
            Picker("Model tier", selection: tierBinding) {
                ForEach(AdminModelTier.all) { Text($0.label).tag($0.id) }
            }
            .disabled(model.savingField != nil)
        } footer: {
            footer(
                "Global default model cost tier for every AI call that has no subject or curriculum override.",
                field: .modelTier
            )
        }

        Section {
            Picker("Knowledge item model", selection: itemModelBinding) {
                ForEach(AdminExtractionModel.all) { Text($0.label).tag($0.id) }
            }
            .disabled(model.savingField != nil)

            if let selected = AdminExtractionModel.all.first(where: { $0.id == model.knowledgeItemModelId }) {
                Text(selected.priceText).font(.footnote).foregroundStyle(.secondary)
                Text(selected.note).font(.footnote).foregroundStyle(.secondary)
            }
        } footer: {
            footer(
                "Model for detecting knowledge items and writing their questions and cards. Applies from the next run. Prices checked \(AdminExtractionModel.pricesCheckedOn).",
                field: .knowledgeItemModel
            )
        }

        Section {
            Stepper(value: cardsBinding, in: AdminSettingsLimits.newCardsPerDay) {
                LabeledContent("New cards per day", value: "\(draftCards)")
            }
        } footer: {
            footer(
                "Most new cards shown in a day, from 1 to 200. Reviews that are due are not limited.",
                field: .newCardsPerDay
            )
        }

        Section {
            Toggle("Test toggle", isOn: toggleBinding)
                .disabled(model.savingField != nil)
        } footer: {
            footer("A placeholder switch for wiring up admin settings end to end.", field: .testToggle)
        }
    }

    private func footer(_ text: String, field: AdminSettingField) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(text)

            if model.failedField == field {
                Text("Couldn't save").foregroundStyle(.red)
            }
        }
    }

    private var tierBinding: Binding<String> {
        Binding(
            get: { model.modelTier },
            set: { value in Task { await model.setModelTier(value) } }
        )
    }

    private var itemModelBinding: Binding<String> {
        Binding(
            get: { model.knowledgeItemModelId },
            set: { value in Task { await model.setKnowledgeItemModel(value) } }
        )
    }

    private var toggleBinding: Binding<Bool> {
        Binding(
            get: { model.testToggle },
            set: { value in Task { await model.setTestToggle(value) } }
        )
    }

    private var cardsBinding: Binding<Int> {
        Binding(
            get: { draftCards },
            set: { value in
                draftCards = value
                cardsTask?.cancel()
                cardsTask = Task {
                    try? await Task.sleep(for: .milliseconds(600))

                    guard !Task.isCancelled else { return }

                    await model.setNewCardsPerDay(value)
                    draftCards = model.newCardsPerDay
                }
            }
        )
    }
}
