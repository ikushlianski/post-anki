#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Post Anki desktop shell.
//
// This entry point intentionally carries no networking logic of its own: the window's
// initial page (see tauri.conf.json's `build.devUrl` / `build.frontendDist`) is either the
// live web dev server (dev builds) or the bundled `frontend-dist/` loader (release builds),
// which itself probes reachability and navigates to the deployed apps/web origin — see
// `frontend-dist/app.js` for that logic and the reasoning behind putting it there instead
// of in a native navigation-failure handler.
//
// No backend service base URL and no backend shared-secret credential are known to this
// binary or anywhere else in this package — apps/web's server remains the sole holder of
// that credential, exactly as it is for a regular browser tab pointed at the same origin.
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running post-anki-desktop");
}
