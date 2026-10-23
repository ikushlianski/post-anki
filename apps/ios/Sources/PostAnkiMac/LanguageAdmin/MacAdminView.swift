import PostAnkiAPI
import SwiftUI

struct MacAdminView: View {
    @Environment(\.zoomScale) private var zoomScale

    private var zoom: CGFloat { CGFloat(zoomScale) }

    private enum Pane: String, CaseIterable, Identifiable {
        case scans = "Scans"
        case overview = "Overview"

        var id: String { rawValue }
    }

    @State private var overview = AdminModel()
    @State private var scans = AdminScansModel()
    @State private var pane = Pane.scans
    @State private var selection: AdminScan.ID?
    @State private var pending: AdminScan?

    private var selected: AdminScan? {
        AdminScan.all.first { $0.id == selection }
    }

    var body: some View {
        content
            .navigationTitle("Admin scans")
            .toolbar {
                ToolbarItem {
                    Picker("Pane", selection: $pane) {
                        ForEach(Pane.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }

                if pane == .scans {
                    ToolbarItem {
                        Button { pending = selected } label: {
                            Label("Run scan", systemImage: "play.fill")
                        }
                        .disabled(selected == nil || scans.running.contains(selected?.id ?? ""))
                    }
                } else {
                    ToolbarItem {
                        MacReloadButton(isDisabled: overview.isLoading) { Task { await overview.load() } }
                    }
                }
            }
            .confirmationDialog(
                "Run \(pending?.title ?? "")? This uses paid AI calls.\(pending?.changesData == true ? " It changes your data." : "")",
                isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }),
                titleVisibility: .visible
            ) {
                Button("Run", role: pending?.changesData == true ? .destructive : nil) {
                    guard let scan = pending else { return }

                    Task { await scans.run(scan) }
                }
            }
            .task { await overview.load() }
    }

    @ViewBuilder
    private var content: some View {
        switch pane {
        case .scans: scansTable
        case .overview: overviewList
        }
    }

    private var scansTable: some View {
        Table(AdminScan.all, selection: $selection) {
            TableColumn("Scan") { scan in
                HStack {
                    Text(scan.title)

                    if scan.changesData {
                        Image(systemName: "exclamationmark.triangle").foregroundStyle(.orange)
                            .accessibilityLabel("Changes your data")
                            .help("Changes your data")
                    }
                }
            }
            .width(min: 160 * zoom, ideal: 220 * zoom)

            TableColumn("What it does", value: \.explanation)

            TableColumn("Result") { scan in
                if scans.running.contains(scan.id) {
                    ProgressView().controlSize(.small)
                } else if let refusal = scans.refusals[scan.id] {
                    Text(refusal).foregroundStyle(.red)
                } else if let result = scans.results[scan.id] {
                    Text(result)
                }
            }
            .width(min: 120 * zoom, ideal: 240 * zoom)
        }
        .contextMenu(forSelectionType: AdminScan.ID.self) { ids in
            if let scan = AdminScan.all.first(where: { ids.contains($0.id) }) {
                Button("Run scan…") { pending = scan }
                    .disabled(scans.running.contains(scan.id))
            }
        } primaryAction: { ids in
            pending = AdminScan.all.first { ids.contains($0.id) }
        }
    }

    @ViewBuilder
    private var overviewList: some View {
        if !overview.hasLoaded, let message = overview.errorMessage {
            MacLoadStateView(failure: overview.failureKind ?? .other, detail: overview.forbiddenDetail ?? message) {
                Task { await overview.load() }
            }
        } else if !overview.hasLoaded {
            ProgressView()
        } else {
            List { AdminOverviewSections(model: overview) }
                .safeAreaInset(edge: .top, spacing: 0) {
                    MacLibraryErrorBanner(message: overview.forbiddenDetail ?? overview.errorMessage)
                }
        }
    }
}
