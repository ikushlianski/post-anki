import Foundation

enum RedirectPolicy {
    static func allows(from original: URL?, to target: URL?) -> Bool {
        guard let original, let target else { return false }

        guard original.host?.lowercased() == target.host?.lowercased() else { return false }

        if original.scheme?.lowercased() == "https" {
            return target.scheme?.lowercased() == "https"
        }

        return true
    }
}

final class RedirectGuard: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        let allowed = RedirectPolicy.allows(from: task.originalRequest?.url, to: request.url)

        completionHandler(allowed ? request : nil)
    }
}
