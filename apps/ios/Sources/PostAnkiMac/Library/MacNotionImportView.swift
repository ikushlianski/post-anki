import SwiftUI

struct MacNotionImportView: View {
    var body: some View {
        NotionImportScreen()
            .formStyle(.grouped)
            .frame(maxWidth: 640)
            .frame(maxWidth: .infinity)
    }
}
