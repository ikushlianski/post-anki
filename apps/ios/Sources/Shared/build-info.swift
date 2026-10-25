import Foundation
import PostAnkiAPI

enum BuildInfo {
    static var isDev: Bool {
        Bundle.main.bundleIdentifier?.hasSuffix(".dev") == true
    }

    static var environmentName: String {
        isDev ? "Dev" : "Production"
    }

    static var versionText: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"

        return "\(version) (\(build))"
    }

    static var serverHost: String {
        URL(string: APIClient.baseURLString)?.host(percentEncoded: false).map { host in
            let port = URL(string: APIClient.baseURLString)?.port.map { ":\($0)" } ?? ""

            return host + port
        } ?? APIClient.baseURLString
    }
}
