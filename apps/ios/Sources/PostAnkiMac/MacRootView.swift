import SwiftUI
import AppKit

struct MacRootView: View {
    @AppStorage(MacNavigator.storageKey) private var storedSelection = MacFeatureRegistry.fallbackID
    @AppStorage("mac.sidebarCollapsedSections") private var collapsedSections = ""

    @State private var launchCheck = MacLaunchCheck()
    @State private var settingsVersion = 0
    @State private var showingPalette = false
    @State private var resignedAt: Date?
    @State private var lastScope = ServerScope.current

    init() {
        MacFeatureRegistry.assertValid()
    }

    private var selection: Binding<String?> {
        Binding(
            get: { MacFeatureRegistry.feature(id: storedSelection).id },
            set: { newValue in
                if let newValue {
                    storedSelection = newValue
                }
            }
        )
    }

    private func isExpanded(_ section: MacFeatureSection) -> Binding<Bool> {
        Binding(
            get: { !collapsedSections.split(separator: ",").contains(Substring(section.rawValue)) },
            set: { expanded in
                var collapsed = collapsedSections.split(separator: ",").map(String.init)
                collapsed.removeAll { $0 == section.rawValue }

                if !expanded {
                    collapsed.append(section.rawValue)
                }

                collapsedSections = collapsed.joined(separator: ",")
            }
        )
    }

    var body: some View {
        NavigationSplitView {
            List(selection: selection) {
                ForEach(MacFeatureRegistry.visibleSections) { section in
                    Section(section.title, isExpanded: isExpanded(section)) {
                        ForEach(MacFeatureRegistry.features(in: section)) { feature in
                            Label(feature.title, systemImage: feature.systemImage)
                                .badge(feature.badge?() ?? 0)
                                .tag(feature.id)
                                .accessibilityIdentifier("sidebar-\(feature.id)")
                        }
                    }
                }
            }
            .navigationSplitViewColumnWidth(min: 160, ideal: 190, max: 260)
        } detail: {
            VStack(spacing: 0) {
                MacLaunchBanner(check: launchCheck)
                MacFeatureDetailView(feature: MacFeatureRegistry.feature(id: storedSelection))
                    .id(settingsVersion)
                    .accessibilityIdentifier("detail-\(storedSelection)")
            }
        }
        .sheet(isPresented: $showingPalette) { MacCommandPaletteView() }
        .onReceive(NotificationCenter.default.publisher(for: .macShowCommandPalette)) { _ in
            MacPaletteRequest.pending = false
            showingPalette = true
        }
        .onAppear {
            if MacPaletteRequest.pending {
                MacPaletteRequest.pending = false
                showingPalette = true
            }
        }
        .onAppear { launchCheck.run() }
        .onReceive(NotificationCenter.default.publisher(for: .postAnkiSettingsDidSave)) { _ in
            let scope = ServerScope.current

            if scope != lastScope {
                lastScope = scope
                MacHistoryCenter.shared.reset()
            }

            PracticeModelStore.shared.reset()
            settingsVersion += 1
            launchCheck.run()
            Task { await PendingReviewCountStore.shared.refresh() }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didResignActiveNotification)) { _ in
            resignedAt = Date()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            launchCheck.run()
            reloadAfterLongAbsence()
        }
    }

    private func reloadAfterLongAbsence() {
        let shouldReload = MacActivationReloadPolicy.shouldReload(
            resignedAt: resignedAt,
            now: Date(),
            hasUnsentInput: MacUnsentInput.shared.hasAny
        )

        resignedAt = nil

        if shouldReload {
            settingsVersion += 1
        }
    }
}
