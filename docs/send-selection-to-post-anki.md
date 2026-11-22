# Send selected text to Post Anki (macOS Services)

A macOS Services action, "Send to Post Anki", saves any selected text to Post Anki as a pending source. The server sorts it into a subject and turns it into cards later. It works from the Services menu of any app that offers Services on selected text, including the Claude desktop app, and it can take a keyboard shortcut.

## Setup

1. **Create a device token.** In the web app, open Admin Settings, API tokens, and create a token with only the `knowledge:write` scope. Its value starts with `pat_`.
2. **Create the token command file.** `~/Library/Application Support/PostAnki/token-command` holds one line: a command that prints your token on standard output, for example one that reads it from your login Keychain. Set its mode to 600 (`chmod 600`). The action refuses to run if the file is missing, not yours, or readable by others.
3. **Install.** Run `scripts/mac-services/install.sh install`. `install.sh check` confirms the token command file is present and private. `install.sh uninstall` removes the action and the installed script.
4. **Optional shortcut.** In System Settings, Keyboard, Keyboard Shortcuts, Services, Text, assign a shortcut to "Send to Post Anki".

`POSTANKI_URL` overrides the server address; the default is `https://postanki.ilya.online`.

## Using it

Select text, then choose the app menu, Services, "Send to Post Anki", or press the shortcut. A notification confirms the save or names the problem: missing token command, rejected token, no connection, or text over 50,000 characters.

Electron apps such as the Claude desktop app may not list Services in the right-click menu. The app menu or a shortcut is the reliable route there. The Mac Share extension is an alternative where an app offers Share on text.

## Safety

- The selected text is data. It is JSON-encoded without shell interpolation and sent as the note body only.
- The token never appears in arguments, logs or notifications; it reaches `curl` through a config on standard input.
- The text may come from a web page or an AI answer and may contain secrets; check the selection before sending.
- `POSTANKI_DRY_RUN=1` prints the body size and target URL without reading the token or sending anything.
