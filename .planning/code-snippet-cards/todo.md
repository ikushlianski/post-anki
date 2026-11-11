# Code snippet cards

## code-capture

### Scope
- Code captured with the Chrome extension or pasted into a note keeps its line breaks, indentation and language as a fenced code block.
- Out of scope: Importing whole repositories or files from disk.

### Goal
- Captured code reaches the server as a fenced block with indentation intact.

### Criteria
- [x] Selecting code on a web page keeps every line break and indent
- [x] Code blocks carry a language tag when the page names one
- [x] Prose around the code is captured as before

### Coding tasks
- [x] Make the extension turn selected code elements into fenced blocks, keeping indentation and any language tag.
- [x] Keep fenced code untouched through note storage, highlight extraction and inbox titles on the server.

### Notes
- Owns apps/extension/src/capture.

## code-card-writing

### Scope
- Card writing recognises code in a note and writes cards that quote short code as fenced blocks, never retyped prose.
- Out of scope: Running or checking the code.

### Goal
- Notes with code yield cards that show and ask about real code.

### Criteria
- [x] Code in a card keeps the source indentation exactly
- [x] A card shows at most about fifteen code lines
- [x] Prose notes are written exactly as before

### Coding tasks
- [x] Teach card prompts to keep code fenced and ask what it outputs or does.
- [x] Let card validation and the source quote check accept fenced code with its whitespace intact.

### Notes
- Owns apps/api/src/mastra card prompts and apps/api/src/knowledge-bit item validation.

## code-rendering

### Scope
- Cards, triage and review show fenced code in a monospace block, wrapped by default with indentation kept, on web, Mac and iPhone.
- Out of scope: A full code editor inside cards.

### Goal
- Code in cards is readable on phone and desktop without sideways scrolling.

### Criteria
- [x] Code renders monospace with indentation kept on all three apps
- [ ] Long lines wrap by default, indent preserved on wrapped lines
- [x] Plain cards look exactly as before

### Coding tasks
- [x] Render fenced code in web card views as a wrapped monospace block that keeps indentation.
- [x] Render fenced code the same way in Mac and iPhone card, triage and review screens.
- [x] Add light syntax colouring for the code block's language using an established library.
- [x] Add a copy button and a remembered wrap on or off toggle to each code block.

### Notes
- Owns apps/web/src/knowledge-bit card views and apps/ios/Sources/Shared card-text-area and review views.
- Depends on code-card-writing for the fenced code format.

