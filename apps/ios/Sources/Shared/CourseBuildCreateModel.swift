import PostAnkiAPI
import SwiftUI

enum CourseBuildMode: String, CaseIterable, Identifiable {
    case links = "Links"
    case research = "Research a topic"
    case document = "Document link"
    case paste = "Paste material"

    var id: String { rawValue }
}

@Observable
@MainActor
final class CourseBuildCreateModel {
    var subjects: [Subject] = []
    var categories: [SubjectCategory] = []
    var subjectId: String? {
        didSet { if oldValue != subjectId { categoryId = nil; Task { await loadCategories() } } }
    }
    var categoryId: String?
    var name = ""
    var details = ""
    var mode = CourseBuildMode.research
    var links = [""]
    var topic = ""
    var documentURL = ""
    var material = ""
    var isWorking = false
    var errorMessage: String?
    var created: CourseBuildCourse?

    var hasInput: Bool {
        isWorking
            || [name, details, topic, documentURL, material].contains { !trimmed($0).isEmpty }
            || !filledLinks.isEmpty
    }

    var canCreate: Bool {
        guard subjectId != nil, !trimmed(name).isEmpty, !isWorking else { return false }

        switch mode {
        case .links: return !filledLinks.isEmpty
        case .research: return !trimmed(topic).isEmpty
        case .document: return !trimmed(documentURL).isEmpty
        case .paste: return !trimmed(material).isEmpty
        }
    }

    private var filledLinks: [String] {
        links.map(trimmed).filter { !$0.isEmpty }
    }

    func loadSubjects() async {
        do {
            subjects = try await APIClient.listSubjects()

            if subjectId == nil { subjectId = subjects.first?.id }
        } catch {
            errorMessage = CourseBuildError.message(for: error)
        }
    }

    func create() async {
        guard let subjectId, !isWorking else { return }

        isWorking = true
        errorMessage = nil
        defer { isWorking = false }

        let input = CourseBuildCreateInput(
            subjectId: subjectId,
            name: trimmed(name),
            description: trimmed(details).isEmpty ? nil : trimmed(details),
            categoryId: categoryId,
            sources: mode == .links ? filledLinks.map { CourseBuildSourceInput(kind: "link", value: $0) } : nil,
            researchTopic: mode == .research ? trimmed(topic) : nil,
            docUrl: mode == .document ? trimmed(documentURL) : nil,
            pastedMaterial: mode == .paste ? trimmed(material) : nil
        )

        do {
            created = try await APIClient.courseBuildCreate(input)
        } catch {
            errorMessage = CourseBuildError.message(for: error)
        }
    }

    private func loadCategories() async {
        guard let subjectId else { return }

        categories = (try? await APIClient.subjectCategories(subjectId: subjectId)) ?? []
    }

    private func trimmed(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
