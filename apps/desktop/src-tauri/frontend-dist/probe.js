export function describeFailure(error) {
  const timedOut = error instanceof DOMException && error.name === "AbortError";

  return timedOut ? "Timed out reaching Post Anki." : "Network unreachable.";
}

export async function probeReachable(url, { timeoutMs, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await fetchImpl(url, {
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });

    return { reachable: true };
  } catch (error) {
    return { reachable: false, message: describeFailure(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}
