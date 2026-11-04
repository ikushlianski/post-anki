import Foundation

struct LossyArray<Element: Decodable>: Decodable {
    let elements: [Element]

    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        var result: [Element] = []

        while !container.isAtEnd {
            if let element = try? container.decode(Element.self) {
                result.append(element)
            } else {
                _ = try? container.decode(DiscardedValue.self)
            }
        }

        elements = result
    }
}

private struct DiscardedValue: Decodable {}

extension KeyedDecodingContainer {
    func lenientInt(_ key: Key, default fallback: Int = 0) -> Int {
        if let value = try? decodeIfPresent(Int.self, forKey: key) { return value }

        if let value = try? decodeIfPresent(Double.self, forKey: key), value.isFinite {
            return Int(value.rounded())
        }

        if let text = try? decodeIfPresent(String.self, forKey: key), let value = Double(text), value.isFinite {
            return Int(value.rounded())
        }

        return fallback
    }

    func lenientOptionalString(_ key: Key) -> String? {
        (try? decodeIfPresent(String.self, forKey: key)) ?? nil
    }
}

public enum LoadFailureReason {
    public static func describe(_ error: Error) -> String {
        switch error {
        case let error as DecodingError:
            return "decoding: \(decodingDetail(error))"
        case let error as URLError:
            return "network: \(error.code.rawValue)"
        case APIError.unauthorized:
            return "unauthorized"
        case APIError.badStatus(let status, _):
            return "HTTP \(status)"
        case APIError.badURL:
            return "bad URL"
        default:
            return "unexpected error"
        }
    }

    public static func bracketed(_ error: Error) -> String {
        switch error {
        case APIError.unauthorized:
            return "[HTTP 401: unauthorized]"
        case APIError.badStatus(let status, let code):
            return code.map { "[HTTP \(status): \($0)]" } ?? "[HTTP \(status)]"
        case let error as DecodingError:
            return "[decoding: \(decodingDetail(error))]"
        case APIError.badURL:
            return "[bad URL]"
        default:
            return "[\(error.localizedDescription)]"
        }
    }

    private static func decodingDetail(_ error: DecodingError) -> String {
        switch error {
        case .keyNotFound(let key, let context):
            return "missing \(path(context.codingPath + [key]))"
        case .valueNotFound(_, let context):
            return "null \(path(context.codingPath))"
        case .typeMismatch(_, let context):
            return "wrong type \(path(context.codingPath))"
        case .dataCorrupted(let context):
            return "invalid JSON \(path(context.codingPath))"
        @unknown default:
            return "unknown"
        }
    }

    private static func path(_ keys: [CodingKey]) -> String {
        let text = keys.map { $0.intValue.map { "[\($0)]" } ?? ".\($0.stringValue)" }.joined()

        return text.isEmpty ? "root" : text
    }
}
