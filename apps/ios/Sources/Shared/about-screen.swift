import SwiftUI

struct AboutScreen: View {
    private var year: String {
        Date.now.formatted(.dateTime.year())
    }

    var body: some View {
        Form {
            Section {
                LabeledContent("App", value: "Post Anki")
                LabeledContent("Version", value: BuildInfo.versionText)
            }

            Section {
                Text("© \(year) Ilya Kushlianski. All rights reserved.")
                    .foregroundStyle(.secondary)
            }
        }
        #if os(macOS)
        .formStyle(.grouped)
        #endif
        .navigationTitle("About")
    }
}
