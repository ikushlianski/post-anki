import SwiftUI

struct MacUpdateBanner: View {
    let checker: MacUpdateChecker

    var body: some View {
        if let release = checker.bannerRelease {
            ZoomHStack(spacing: 8) {
                Image(systemName: "arrow.down.circle.fill")
                    .foregroundStyle(.tint)
                    .accessibilityHidden(true)

                Text("Post Anki \(release.version.text) is available")

                Spacer()

                Button("Install and restart") { Task { await checker.install() } }

                Button("Later") { checker.dismiss() }
            }
            .zoomPadding(10)
            .background(.bar)
            .accessibilityIdentifier("mac-update-banner")
        }
    }
}
