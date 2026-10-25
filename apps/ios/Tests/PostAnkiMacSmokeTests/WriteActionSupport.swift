import Foundation
import Testing

enum Wire {
    static func decode<T: Decodable>(_ type: T.Type, _ json: String) -> T {
        try! JSONDecoder().decode(type, from: Data(json.utf8))
    }

    static func fixture<T: Decodable>(_ type: T.Type, _ name: String) -> T {
        try! JSONDecoder().decode(type, from: SmokeFixture.data(name))
    }
}

struct WriteFailureCase: Sendable, CustomTestStringConvertible {
    let name: String
    let reply: FakeReply
    let message: String

    var testDescription: String { name }

    static let signedOutMessage = "Check Settings: your access token was rejected."
    static let offlineMessage = "Couldn't connect to the server. Try again."

    static let signedOut = WriteFailureCase(name: "signed out", reply: .status(401), message: signedOutMessage)

    static let offline = WriteFailureCase(
        name: "dropped connection",
        reply: .failure(.networkConnectionLost),
        message: offlineMessage
    )

    static func rejected(_ code: String, status: Int = 400, message: String) -> WriteFailureCase {
        WriteFailureCase(name: "server rejection \(code)", reply: .json(status, #"{"error":"\#(code)"}"#), message: message)
    }
}
