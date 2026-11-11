import Foundation
import Testing

extension SmokeTests {
    @Suite("Fenced code splitter")
    struct FencedCodeSplitterSmokeTests {
        @Test("should keep plain card text as one prose segment")
        func plainText() {
            let text = "What is 2 + 2?\nUse `code` inline, not a block."

            #expect(!FencedCodeSplitter.hasFence(text))
            #expect(FencedCodeSplitter.split(text) == [.prose(text)])
        }

        @Test("should keep indentation inside a block exactly")
        func indentation() {
            let text = "Fix it:\n```swift\nfunc a() {\n    if x {\n\treturn\n    }\n}\n```\nDone"

            #expect(FencedCodeSplitter.split(text) == [
                .prose("Fix it:\n"),
                .code(language: "swift", code: "func a() {\n    if x {\n\treturn\n    }\n}"),
                .prose("\nDone"),
            ])
        }

        @Test("should accept CRLF fences and return code with line feeds")
        func crlf() {
            let text = "```py\r\nif a:\r\n    b()\r\n```\r\nnext"

            #expect(FencedCodeSplitter.split(text) == [
                .code(language: "py", code: "if a:\n    b()"),
                .prose("\nnext"),
            ])
        }

        @Test("should run an unclosed fence to the end of the text")
        func unclosed() {
            let text = "Intro\n```js\nlet a = 1\n  let b = 2\n"

            #expect(FencedCodeSplitter.split(text) == [
                .prose("Intro\n"),
                .code(language: "js", code: "let a = 1\n  let b = 2\n"),
            ])
        }

        @Test("should allow empty blocks")
        func emptyBlocks() {
            #expect(FencedCodeSplitter.split("```\n```") == [.code(language: nil, code: "")])
            #expect(FencedCodeSplitter.split("```go\n```") == [.code(language: "go", code: "")])
            #expect(FencedCodeSplitter.split("```") == [.code(language: nil, code: "")])
        }

        @Test("should not close a longer fence with a shorter one")
        func longerFence() {
            #expect(FencedCodeSplitter.split("````md\n```\ninner\n```\n````") == [.code(language: "md", code: "```\ninner\n```")])
        }

        @Test("should leave backticks that are not at a line start as prose")
        func inlineBackticks() {
            #expect(!FencedCodeSplitter.hasFence("see ```code``` here"))
        }

        @Test("should split two blocks around prose")
        func twoBlocks() {
            #expect(FencedCodeSplitter.split("```a\n1\n```\nmid\n```b\n2\n```") == [
                .code(language: "a", code: "1"),
                .prose("\nmid\n"),
                .code(language: "b", code: "2"),
            ])
        }
    }
}
