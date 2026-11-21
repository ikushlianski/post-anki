import Testing
@testable import PostAnkiAPI

@Suite("Speech text")
struct SpeechTextTests {
    @Test("should read cloze answers without markers or hints")
    func cloze() {
        #expect(SpeechTextCleaner.clean("The capital is {{c1::Paris::city}}.") == "The capital is Paris.")
    }

    @Test("should drop markdown emphasis, headings, bullets and links but keep their words")
    func markdown() {
        let text = "## Title\n- **bold** and _soft_\n- see [the docs](https://x.dev/a)"

        #expect(SpeechTextCleaner.clean(text) == "Title. bold and soft. see the docs")
    }

    @Test("should read snake_case identifiers without underscores and keep italics working")
    func underscores() {
        #expect(SpeechTextCleaner.clean("Call get_user_by_id and my_var_name now") == "Call get user by id and my var name now")
        #expect(SpeechTextCleaner.clean("This is _very_ clear and __bold__ too") == "This is very clear and bold too")
    }

    @Test("should skip code blocks and bare urls so they are not read out")
    func code() {
        let text = "Run this:\n```ts\nconst a = 1\n```\nThen visit https://example.com now"

        #expect(SpeechTextCleaner.clean(text) == "Run this:. Then visit now")
    }

    @Test("should drop parenthesised hints")
    func hints() {
        #expect(SpeechTextCleaner.clean("Name the layer (hint: starts with T)") == "Name the layer")
    }

    @Test("should return empty text when nothing speakable remains")
    func empty() {
        #expect(SpeechTextCleaner.clean("```\ncode\n```").isEmpty)
    }

    @Test("should append dictated words after what the learner already typed")
    func mergeAppends() {
        #expect(DictationText.merge(base: "What is ", transcript: "a closure") == "What is a closure")
    }

    @Test("should keep typed text when nothing was heard")
    func mergeSilent() {
        #expect(DictationText.merge(base: "typed", transcript: "  ") == "typed")
    }

    @Test("should use only the spoken words when the box was empty")
    func mergeEmptyBase() {
        #expect(DictationText.merge(base: "", transcript: " hello ") == "hello")
    }
}
