import Foundation

public enum PasswordSignInError: Error, Equatable, Sendable {
    case insecureAddress
    case wrongCredentials
    case rateLimited
    case noTokenReturned
    case server(Int)
}

public enum PasswordSignIn {
    public static func signIn(email: String, password: String, baseURL: String? = nil) async throws {
        let url = try endpoint("/api/auth/sign-in/email", baseURL: baseURL)
        var request = URLRequest(url: url)

        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONEncoder().encode(Credentials(email: email, password: password))

        let (_, response) = try await URLSession.shared.data(for: request)
        let http = response as? HTTPURLResponse
        let status = http?.statusCode ?? 0

        if status == 429 { throw PasswordSignInError.rateLimited }

        if status == 401 || status == 400 { throw PasswordSignInError.wrongCredentials }

        guard (200..<300).contains(status) else { throw PasswordSignInError.server(status) }

        guard let token = http?.value(forHTTPHeaderField: "set-auth-token"), !token.isEmpty else {
            throw PasswordSignInError.noTokenReturned
        }

        try TokenStore.save(token)
    }

    public static func signOut(baseURL: String? = nil) async {
        defer { try? TokenStore.clear() }

        guard let url = try? endpoint("/api/auth/sign-out", baseURL: baseURL),
              let token = TokenStore.read() else { return }

        var request = URLRequest(url: url)

        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = Data("{}".utf8)
        _ = try? await URLSession.shared.data(for: request)
    }

    private static func endpoint(_ path: String, baseURL: String?) throws -> URL {
        guard let url = URL(string: "\(baseURL ?? APIClient.baseURLString)\(path)") else {
            throw APIError.badURL
        }

        guard url.scheme?.lowercased() == "https" || APIClient.allowsPlainHTTP(host: url.host()) else {
            throw PasswordSignInError.insecureAddress
        }

        return url
    }

    private struct Credentials: Encodable {
        let email: String
        let password: String
    }
}
