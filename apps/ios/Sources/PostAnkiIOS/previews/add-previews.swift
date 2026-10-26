#if DEBUG
import SwiftUI

#Preview("Add: input") {
    NavigationStack { IngestionDictationScreen() }
}

#Preview("Add: subject tree picker") {
    @Previewable @State var selection: String? = "s-actors"

    return Form {
        SubjectTreePicker(
            title: "Subject",
            nodes: SubjectTreePath.tree(from: PreviewSampleData.treeSubjects),
            selection: $selection
        )
    }
}
#endif
