---
type: todo
branch: tauri-desktop-app
task: Build a Tauri desktop app for Post Anki wrapping the same web app / reusing the same apps/api backend
state: open
updated: 2026-07-17
---
# Todo: Tauri desktop app for Post Anki

## Decisions to make
Nothing to decide — the webview-wrapper architecture, the security decision, and the config
approach are all resolved in `spec.md` / `architecture.md`.

## To review / clarify
Nothing to review.

## Manual steps
- **Rust toolchain**: this machine has no `cargo`/`rustc`/`rustup`. Building or running the Tauri
  shell (`cargo tauri dev` / `cargo tauri build`) requires installing Rust on a machine that will
  actually build it — cannot be done or proven as part of this pass.
- **App icons**: ship with Tauri's default template icon set for v1; swap in real Post Anki brand
  icons (`icon.icns`/`icon.ico`/PNGs under `apps/desktop/src-tauri/icons/`) as a follow-up — not
  blocking, purely cosmetic.
- **CI / release packaging / code signing**: no GitHub Actions workflow or `tauri-action` pipeline
  is added in this pass. A follow-up wishlist item should cover automated multi-OS builds and
  (for macOS/Windows) code signing — both require accounts/certificates outside this repo's IaC.

## Post-deploy checks
Not applicable — nothing is deployed. First real verification happens the first time a developer
with Rust installed runs `cargo tauri dev` on their own machine.
