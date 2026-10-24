import type { ToastMessage } from "./describe-toast.js";

// Runs inside the page via executeScript, so it must not reference imports at runtime.
export function renderPageToast(message: ToastMessage): void {
  const hostId = "post-anki-toast-host";
  const colors = { success: "#166534", info: "#1e40af", error: "#991b1b" };

  document.getElementById(hostId)?.remove();

  const host = document.createElement("div");

  host.id = hostId;
  host.style.cssText = "all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;pointer-events:none;";

  const root = host.attachShadow({ mode: "open" });
  const box = document.createElement("div");

  box.setAttribute("role", "status");
  box.setAttribute("aria-live", "polite");
  box.textContent = message.text;
  box.style.cssText = [
    `background:${colors[message.kind]}`,
    "color:#fff",
    "font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif",
    "padding:10px 14px",
    "border-radius:8px",
    "max-width:320px",
    "box-shadow:0 4px 14px rgba(0,0,0,.35)",
  ].join(";");
  root.appendChild(box);
  document.documentElement.appendChild(host);
  setTimeout(() => host.remove(), 3000);
}
