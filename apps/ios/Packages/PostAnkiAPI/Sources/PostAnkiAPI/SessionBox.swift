import Foundation

final class SessionBox: @unchecked Sendable {
    private let lock = NSLock()
    private var current = SessionBox.makeSession(protocolClasses: nil)

    var session: URLSession { lock.withLock { current } }

    func replace(protocolClasses: [AnyClass]) {
        let next = SessionBox.makeSession(protocolClasses: protocolClasses.isEmpty ? nil : protocolClasses)
        lock.withLock { current = next }
    }

    private static func makeSession(protocolClasses: [AnyClass]?) -> URLSession {
        let configuration = URLSessionConfiguration.default

        if let protocolClasses {
            configuration.protocolClasses = protocolClasses
        }

        return URLSession(configuration: configuration, delegate: RedirectGuard(), delegateQueue: nil)
    }
}
