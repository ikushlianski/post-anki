import PostAnkiAPI

extension KnowledgeItemActionsModel {
    func move(to subject: Subject) async -> Bool {
        guard !isBusy else { return false }

        let previous = subjectId

        message = nil
        subjectId = subject.id

        writes.enqueue { [self] in
            do {
                let result = try await APIClient.moveKnowledgeBits(ids: [itemId], subjectId: subject.id)

                guard result.moved.contains(itemId) else {
                    undoMove(to: previous, from: subject.id)
                    message = "Couldn't move this item. Try again."

                    return
                }

                onMoved?(subject.id)
            } catch {
                undoMove(to: previous, from: subject.id)
                message = KnowledgeManageError.message(for: error, action: "move this item")

                if case APIError.badStatus(404, "subject_not_found") = error {
                    subjects = []
                    await loadSubjects()
                }
            }
        }

        return true
    }

    var isSuspended: Bool { state == "suspended" }

    var isBuried: Bool { state == "buried" }

    func toggleSuspend() async {
        let before = state
        let restored = initialState == "suspended" || initialState == "buried" ? "active" : initialState
        let request: (suspended: Bool?, buried: Bool?)
        let next: String

        if isSuspended {
            request = (false, nil)
            next = restored
        } else if isBuried {
            request = (nil, false)
            next = restored
        } else {
            request = (true, nil)
            next = "suspended"
        }

        message = nil
        state = next

        writes.enqueue { [self] in
            do {
                let result = try await APIClient.setSchedule(id: itemId, suspended: request.suspended, buried: request.buried)
                let confirmed = Self.confirmedState(result, restored: restored)

                if state == next { state = confirmed }

                onStateChange?(confirmed)
            } catch {
                if state == next { state = before }

                message = KnowledgeManageError.message(for: error, action: "update this item")
            }
        }
    }

    private func undoMove(to previous: String?, from attempted: String) {
        if subjectId == attempted { subjectId = previous }
    }

    private static func confirmedState(_ result: ScheduleControlResult, restored: String) -> String {
        if result.suspended { return "suspended" }

        return result.buriedUntil != nil ? "buried" : restored
    }
}
