// visual-knowledge-map (issue #86) — jsdom (this app's vitest `environment`)
// ships no ResizeObserver global, but @xyflow/react requires one to
// measure/position nodes. Without this stub, every domain-map-graph test's
// node-count and click-target assertions fail regardless of whether the
// component logic is correct (found during red-team review).
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}
