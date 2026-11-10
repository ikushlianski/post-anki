import BackgroundTasks
import Foundation

enum ReviewPackBackgroundTask {
    static var identifier: String {
        "\(Bundle.main.bundleIdentifier ?? "com.ikushlianski.postankiios").review-pack-refresh"
    }

    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)

                return
            }

            handle(refreshTask)
        }
    }

    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: identifier)

        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    private static func handle(_ task: BGAppRefreshTask) {
        schedule()

        let completion = TaskCompletion(task: task)
        let work = Task { @MainActor in
            let refreshed = await ReviewPackSync.shared.refresh(.backgroundTask)

            completion.finish(success: refreshed)
        }

        task.expirationHandler = { work.cancel() }
    }
}

private final class TaskCompletion: @unchecked Sendable {
    private let task: BGAppRefreshTask

    init(task: BGAppRefreshTask) {
        self.task = task
    }

    func finish(success: Bool) {
        task.setTaskCompleted(success: success)
    }
}
