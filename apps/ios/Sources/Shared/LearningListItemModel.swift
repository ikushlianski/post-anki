import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class LearningListItemModel {
    var item: LearningListItem
    var isWorking = false
    var message: String?
    var curriculum: Curriculum?
    var openableCurriculumId: String?
    let writes = SerialWriteQueue()

    init(item: LearningListItem) {
        self.item = item
        openableCurriculumId = item.curriculumId
    }

    var destinationText: String {
        guard let recommendation = item.recommendation else { return "" }

        switch recommendation.destination {
        case "fold_in": return "Add to \(recommendation.areaName ?? "an existing area")"
        case "mini_course": return "Make a short subject"
        case "extend_curriculum":
            return "Extend \(recommendation.existingCurriculumMatch?.title ?? "an existing course")"
        default: return "Park for later"
        }
    }

    func settle() async { await writes.settle() }

    func decide(approve: Bool) async {
        guard item.isAwaitingDecision else { return }

        let before = item

        message = nil
        item.status = approve ? "classifying" : "declined"

        writes.enqueue { [self] in
            do {
                apply(try await APIClient.decideLearningItem(id: before.id, approve: approve))
            } catch {
                item = before
                message = LearningListError.message(for: error)

                if LearningListError.isStale(error), let fresh = try? await APIClient.getLearningItem(id: before.id) {
                    item = fresh
                }
            }
        }
    }

    func choose(destination: String) async {
        await run {
            let result = try await APIClient.chooseLearningDestination(id: item.id, destination: destination)

            apply(result)
        }
    }

    func classify(subjectId: String) async {
        await run {
            item = try await APIClient.classifyLearningItem(id: item.id, subjectId: subjectId)
        }
    }

    func openCourse() async {
        guard let id = openableCurriculumId else { return }

        await run {
            let all = try await APIClient.listCurricula()

            curriculum = all.first { $0.id == id }

            if curriculum == nil { message = "Couldn't open this subject." }
        }
    }

    private func apply(_ result: LearningListDecisionResult) {
        item = result.item
        openableCurriculumId = result.curriculumId ?? result.item.curriculumId
    }

    private func run(_ work: () async throws -> Void) async {
        guard !isWorking else { return }

        isWorking = true
        message = nil
        defer { isWorking = false }

        do {
            try await work()
        } catch {
            message = LearningListError.message(for: error)

            if LearningListError.isStale(error), let fresh = try? await APIClient.getLearningItem(id: item.id) {
                item = fresh
            }
        }
    }
}
