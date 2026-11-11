import PostAnkiAPI
import SwiftUI

struct MacSubjectStudyPlanSheet: View {
    let subject: SubjectManageSubject

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            StudyPlanScreen(subjectId: subject.id, title: "Study plan: \(subject.name)")
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
        }
        .macSheetMinSize(width: 520, height: 560)
    }
}
