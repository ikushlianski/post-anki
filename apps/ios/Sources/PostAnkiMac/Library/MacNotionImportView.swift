import SwiftUI

struct MacNotionImportView: View {
    @Environment(\.zoomScale) private var zoomScale

    private var zoom: CGFloat { CGFloat(zoomScale) }

    var body: some View {
        NotionImportScreen()
            .formStyle(.grouped)
            .frame(maxWidth: 640 * zoom)
            .frame(maxWidth: .infinity)
    }
}
