import PostAnkiAPI
import SwiftUI

struct OwnerRejectReasonsBySubjectType: View {
    let groups: [RejectReasonsBySubjectType]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Reject reasons by subject type").font(.headline)

            if groups.allSatisfy({ $0.total == 0 }) {
                Text("No rejected cards yet").foregroundStyle(.secondary)
            } else {
                ForEach(groups.filter { $0.total > 0 }) { group in
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(group.title) (\(group.total))").font(.subheadline.weight(.semibold))

                        ForEach(group.reasons) { reason in
                            HStack(alignment: .firstTextBaseline) {
                                Text(reason.label).font(.caption)
                                Spacer()
                                Text("\(reason.count) (\(reason.percentText))").font(.caption).monospacedDigit()
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                }
            }
        }
    }
}

struct OwnerFusionModelsSection: View {
    let models: [OwnerTriageModel]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Fusion models: kept / rejected").font(.headline)

            if models.isEmpty {
                Text("No triage decisions in this range").foregroundStyle(.secondary)
            } else {
                ForEach(models) { model in
                    HStack(alignment: .firstTextBaseline) {
                        Text(model.modelId).font(.caption)
                        Spacer()
                        Text("\(model.kept) / \(model.rejected)").font(.caption).monospacedDigit()
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}
