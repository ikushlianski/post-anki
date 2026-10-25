import PostAnkiAPI
import SwiftUI

struct CourseBuildTopicPickSection: View {
    let model: CourseBuildModel
    let modules: [CourseBuildModule]
    let course: CourseBuildCourse

    var body: some View {
        Section {
            Text("Choose which topics you want to study.").foregroundStyle(.secondary)

            Button("Include all") { Task { await model.includeAll() } }
        }

        ForEach(modules) { module in
            Section(module.title) {
                ForEach(module.topics) { topic in
                    Toggle(topic.title, isOn: Binding(
                        get: { topic.included },
                        set: { isOn in Task { await model.setIncluded(topic, included: isOn) } }
                    ))
                }
            }
        }

        Section {
            Button("Confirm subject") { Task { await model.confirmCourse() } }
        }
    }
}
