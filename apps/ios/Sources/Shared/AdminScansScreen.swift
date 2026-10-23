import SwiftUI

struct AdminScansScreen: View {
    @State private var model = AdminScansModel()
    @State private var pending: AdminScan?

    var body: some View {
        List(AdminScan.all) { scan in
            Button(role: scan.changesData ? .destructive : nil) {
                pending = scan
            } label: {
                ZoomVStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(scan.title)

                        if model.running.contains(scan.id) { ProgressView() }
                    }

                    Text(scan.explanation).zoomFont(.caption).foregroundStyle(.secondary)

                    if let result = model.results[scan.id] {
                        Text(result).zoomFont(.caption)
                    }
                }
            }
        }
        .navigationTitle("Run scans")
        .confirmationDialog(
            "Run \(pending?.title ?? "")? This uses paid AI calls.\(pending?.changesData == true ? " It changes your data." : "")",
            isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }),
            titleVisibility: .visible
        ) {
            Button("Run", role: pending?.changesData == true ? .destructive : nil) {
                guard let scan = pending else { return }

                Task { await model.run(scan) }
            }
        }
    }
}
