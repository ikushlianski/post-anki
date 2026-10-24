import { describe, expect, it, vi } from "vitest";
import { createPinnedLookup } from "./pinned-dispatcher.js";

describe("createPinnedLookup", () => {
  it("should answer with the pinned address whatever hostname is asked for", () => {
    const callback = vi.fn();

    createPinnedLookup([{ address: "93.184.216.34", family: 4 }])("rebind.example.com", {}, callback);

    expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
  });

  it("should answer with every pinned address when the connection asks for all of them", () => {
    const callback = vi.fn();

    createPinnedLookup([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1::1", family: 6 },
    ])("example.com", { all: true }, callback);

    expect(callback).toHaveBeenCalledWith(null, [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1::1", family: 6 },
    ]);
  });

  it("should fail the connection when nothing was pinned instead of resolving again", () => {
    const callback = vi.fn();

    createPinnedLookup([])("example.com", {}, callback);

    expect(callback.mock.calls[0]![0]).toMatchObject({ code: "ENOTFOUND" });
  });
});
