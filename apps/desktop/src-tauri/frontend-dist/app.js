// Post Anki desktop shell — release-build loader.
//
// Tauri v2 does not expose a reliable, cross-platform "navigation failed" event for a
// top-level remote URL (WebKit/WebView2 each surface this differently, and several are
// known-unreliable — see tauri-apps/tauri#9689 and tauri-apps/tauri#4037). So instead of
// pointing the window straight at the remote origin and hoping the OS webview's native
// error page is acceptable, this local page probes reachability itself before handing off
// navigation, and renders our own retry state on failure. This is the same "ping a known
// endpoint first" pattern the Tauri community uses for connectivity checks.
//
// This constant is this app's ONLY notion of where Post Anki lives — no backend service
// base URL, no shared credential, nothing else network-related is known to this bundle.
// The reachability decision itself lives in probe.js (a pure module, unit-tested); this
// file is DOM glue only.
import { probeReachable } from "./probe.js";

const DESKTOP_APP_URL = "https://postanki.ilya.online";
const PROBE_TIMEOUT_MS = 8000;

const loadingState = document.getElementById("loading-state");
const retryState = document.getElementById("retry-state");
const retryDetail = document.getElementById("retry-detail");
const retryButton = document.getElementById("retry-button");

function showLoading() {
  loadingState.style.display = "block";
  retryState.style.display = "none";
}

function showRetry(detail) {
  loadingState.style.display = "none";
  retryState.style.display = "flex";
  retryDetail.textContent = detail;
}

async function probeAndNavigate() {
  showLoading();

  const outcome = await probeReachable(DESKTOP_APP_URL, { timeoutMs: PROBE_TIMEOUT_MS });

  if (outcome.reachable) {
    window.location.href = DESKTOP_APP_URL;
    return;
  }

  showRetry(outcome.message);
}

retryButton.addEventListener("click", () => {
  probeAndNavigate();
});

window.addEventListener("online", () => {
  if (retryState.style.display === "flex") {
    probeAndNavigate();
  }
});

probeAndNavigate();
