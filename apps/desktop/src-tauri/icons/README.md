# Placeholder icons

These are solid-color placeholders generated locally (not the real Post Anki brand icon),
tracked as a known follow-up in `.planning/tauri-desktop-app/todo.md`.

To replace them with real branding on a machine with the Rust/Tauri toolchain installed:

```
cargo tauri icon path/to/source-icon.png
```

run from `apps/desktop/`, pointing at a high-resolution (1024x1024+) source PNG. That
regenerates every file in this directory, including `icon.icns` (macOS) and `icon.ico`
(Windows), from the single source image.
