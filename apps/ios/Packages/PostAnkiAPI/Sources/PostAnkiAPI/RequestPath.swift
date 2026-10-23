import Foundation

extension APIClient {
    static func encodedSegment(_ value: String) -> String {
        var result = ""

        for byte in value.utf8 {
            if isUnreserved(byte) {
                result.unicodeScalars.append(Unicode.Scalar(byte))
            } else {
                result += "%" + String(byte, radix: 16, uppercase: true).leftPadded(to: 2)
            }
        }

        return result
    }

    static func encodedQuery(_ items: [URLQueryItem]) -> String {
        guard !items.isEmpty else { return "" }

        let pairs = items.map { "\(encodedSegment($0.name))=\(encodedSegment($0.value ?? ""))" }

        return "?" + pairs.joined(separator: "&")
    }

    static func encodedPath(_ base: String, query: [URLQueryItem] = []) -> String {
        base + encodedQuery(query)
    }

    private static func isUnreserved(_ byte: UInt8) -> Bool {
        switch byte {
        case 0x30...0x39, 0x41...0x5A, 0x61...0x7A, 0x2D, 0x2E, 0x5F, 0x7E:
            return true
        default:
            return false
        }
    }
}

private extension String {
    func leftPadded(to length: Int) -> String {
        count >= length ? self : String(repeating: "0", count: length - count) + self
    }
}
