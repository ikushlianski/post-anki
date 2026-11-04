import SwiftUI

enum ModelBadgeName {
    static func short(_ id: String) -> String {
        id.split(separator: "/").last.map(String.init) ?? id
    }
}

struct ModelBadges: View {
    let modelIds: [String]

    var body: some View {
        if !modelIds.isEmpty {
            ZoomHStack(spacing: 6) {
                ForEach(modelIds, id: \.self) { id in
                    Text(ModelBadgeName.short(id))
                        .zoomFont(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                        .zoomPadding(.horizontal, 8)
                        .zoomPadding(.vertical, 2)
                        .background(Color.secondary.opacity(0.14), in: Capsule())
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Models: \(modelIds.map(ModelBadgeName.short).joined(separator: ", "))")
        }
    }
}
