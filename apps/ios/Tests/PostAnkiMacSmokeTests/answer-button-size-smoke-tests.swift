import Foundation
import Testing

extension SmokeTests {
    @Suite("Answer button size")
    struct AnswerButtonSizeSmokeTests {
        private func makeDefaults() throws -> (UserDefaults, String) {
            let suite = "answer-button-size-\(UUID().uuidString)"
            return (try #require(UserDefaults(suiteName: suite)), suite)
        }

        @Test("should default to a size at least as tall as the old 64pt buttons")
        func defaultSize() throws {
            let (defaults, suite) = try makeDefaults()
            defer { defaults.removePersistentDomain(forName: suite) }

            let size = AnswerButtonSizeStore(defaults: defaults).load()

            #expect(size == .l)
            #expect(size.height >= 64)
        }

        @Test("should remember the chosen size across launches")
        func persists() throws {
            let (defaults, suite) = try makeDefaults()
            defer { defaults.removePersistentDomain(forName: suite) }

            AnswerButtonSizeStore(defaults: defaults).save(.xxl)

            #expect(AnswerButtonSizeStore(defaults: defaults).load() == .xxl)
        }

        @Test("should fall back to the default when the stored value is unknown")
        func unknownValue() throws {
            let (defaults, suite) = try makeDefaults()
            defer { defaults.removePersistentDomain(forName: suite) }

            defaults.set("huge", forKey: AnswerButtonSizeStore.key)

            #expect(AnswerButtonSizeStore(defaults: defaults).load() == .l)
        }

        @Test("should grow in height from XS to XXL")
        func ordering() {
            let heights = AnswerButtonSize.allCases.map(\.height)

            #expect(heights == heights.sorted())
            #expect(Set(heights).count == heights.count)
            #expect(AnswerButtonSize.allCases.allSatisfy { $0.height >= AnswerButtonLayout.minHeight })
            #expect(AnswerButtonLayout.minHeight >= 56)
            #expect(AnswerButtonLayout.spacing >= 12)
            #expect((120...140).contains(AnswerButtonSize.xxl.height))
        }
    }
}
