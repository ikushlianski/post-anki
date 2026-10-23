import Foundation
import Security

public struct TokenStoreError: Error, Sendable {
    public let status: OSStatus
}

public enum TokenStore {
    private static let service = "com.ikushlianski.postankiios.api"
    private static let account = "access-token"

    private static var identity: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: kCFBooleanFalse as Any
        ]
    }

    private static let cache = TokenCache()

    public static func read() -> String? {
        cache.read(load: readKeychain)
    }

    private static func readKeychain() -> String? {
        var query = identity
        query[kSecReturnData as String] = kCFBooleanTrue
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        guard status == errSecSuccess, let data = item as? Data else {
            return nil
        }

        return String(data: data, encoding: .utf8)
    }

    public static func save(_ token: String) throws {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmed.isEmpty else {
            try clear()
            return
        }

        guard trimmed.unicodeScalars.allSatisfy({ (0x21...0x7E).contains($0.value) }) else {
            throw TokenStoreError(status: errSecParam)
        }

        let data = Data(trimmed.utf8)
        let updateStatus = SecItemUpdate(
            identity as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )

        if updateStatus == errSecSuccess {
            cache.set(trimmed)

            return
        }

        guard updateStatus == errSecItemNotFound else {
            throw TokenStoreError(status: updateStatus)
        }

        var attributes = identity
        attributes[kSecValueData as String] = data
        #if os(iOS)
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        #endif

        let addStatus = SecItemAdd(attributes as CFDictionary, nil)

        guard addStatus == errSecSuccess else {
            throw TokenStoreError(status: addStatus)
        }

        cache.set(trimmed)
    }

    public static func clear() throws {
        let status = SecItemDelete(identity as CFDictionary)

        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw TokenStoreError(status: status)
        }

        cache.set(nil)
    }
}

final class TokenCache: @unchecked Sendable {
    private let lock = NSLock()
    private var loaded = false
    private var token: String?

    func read(load: () -> String?) -> String? {
        lock.withLock {
            if !loaded {
                token = load()
                loaded = true
            }

            return token
        }
    }

    func set(_ value: String?) {
        lock.withLock {
            token = value
            loaded = true
        }
    }
}
