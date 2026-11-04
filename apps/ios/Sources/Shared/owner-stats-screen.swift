import Charts
import PostAnkiAPI
import SwiftUI

struct OwnerStatsScreen: View {
    @State private var model = OwnerStatsModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header

                if let failure = model.failure {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(failure).font(.caption).foregroundStyle(.secondary)
                        Button("Try again") { Task { await model.load() } }
                    }
                }

                if let learning = model.learning {
                    OwnerStatsTiles(learning: learning, monthSpendUsd: model.monthSpendUsd)
                    OwnerReviewsChart(days: learning.daily)
                }

                if let spend = model.spend {
                    OwnerSpendChart(spend: spend)
                    OwnerFusionModelsSection(models: spend.triageByModel)
                }

                if let reasons = model.rejectReasons {
                    OwnerRejectReasonsBySubjectType(groups: reasons.bySubjectType)
                }

                if model.learning == nil && model.spend == nil && model.failure == nil {
                    ProgressView().frame(maxWidth: .infinity)
                }
            }
            .padding()
        }
        .navigationTitle("Statistics")
        .task { await model.loadIfNeeded() }
        .refreshable { await model.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !model.env.isEmpty {
                Text(model.env)
                    .font(.caption.weight(.medium))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(isProduction ? Color.red.opacity(0.15) : Color.orange.opacity(0.2), in: .rect(cornerRadius: 4))
                    .accessibilityLabel("Environment \(model.env)")
            }

            Picker("Range", selection: Binding(get: { model.range }, set: { next in Task { await model.select(next) } })) {
                ForEach(OwnerStatsRange.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
        }
    }

    private var isProduction: Bool { model.env == "production" || model.env == "prod" }
}
