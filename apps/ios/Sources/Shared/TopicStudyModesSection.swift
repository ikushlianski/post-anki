import PostAnkiAPI
import SwiftUI

struct TopicStudyModesSection: View {
    let topic: Topic

    var body: some View {
        Section("Quiz") {
            NavigationLink {
                TopicQuizScreen(topic: topic)
            } label: {
                Label("Quick test", systemImage: "checklist")
            }

            NavigationLink {
                SocraticScreen(topic: topic)
            } label: {
                Label("Socratic dialogue", systemImage: "bubble.left.and.text.bubble.right")
            }

            NavigationLink {
                LectureScreen(topic: topic)
            } label: {
                Label("Lecture and examples", systemImage: "book")
            }

            NavigationLink {
                TopicGapsScreen(topic: topic)
            } label: {
                Label("Gaps", systemImage: "list.bullet.clipboard")
            }
        }
    }
}
