import PostAnkiAPI
import SwiftUI

struct FusionSettingsSection: View {
    let model: AdminSettingsModel

    var body: some View {
        Section {
            Toggle("Fusion mode", isOn: enabledBinding)
                .disabled(model.savingField != nil)

            ForEach(AdminExtractionModel.all) { option in
                modelRow(option)
            }

            if let hint = FusionSelection.hint(enabled: model.fusionEnabled, count: model.fusionModelIds.count) {
                Text(hint).font(.footnote).foregroundStyle(.orange)
            }

            if let estimate = model.settings?.fusionEstimate, !model.fusionModelIds.isEmpty {
                LabeledContent("Estimated cost per source", value: estimate.totalText)
            }
        } header: {
            Text("Fusion mode")
        } footer: {
            VStack(alignment: .leading, spacing: 4) {
                Text("Runs extraction on 2 to 5 models and merges the results. Costs more per source; applies from the next run.")

                if model.failedField == .fusion {
                    Text(model.refusalMessage ?? "Couldn't save").foregroundStyle(.red)
                }
            }
        }
    }

    private func modelRow(_ option: AdminExtractionModel) -> some View {
        let selected = model.fusionModelIds.contains(option.id)
        let locked = !selected && !FusionSelection.canAdd(model.fusionModelIds)

        return Button {
            Task { await model.toggleFusionModel(option.id) }
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(option.label)
                    Text(option.priceText).font(.footnote).foregroundStyle(.secondary)
                }

                Spacer()

                if selected, let cost = model.settings?.fusionEstimate?.costText(for: option.id) {
                    Text(cost).font(.footnote).foregroundStyle(.secondary)
                }

                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(selected ? Color.accentColor : Color.secondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(locked || model.savingField != nil)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var enabledBinding: Binding<Bool> {
        Binding(
            get: { model.fusionEnabled },
            set: { value in Task { await model.setFusionEnabled(value) } }
        )
    }
}
