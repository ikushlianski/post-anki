import { describe, expect, it, vi } from "vitest";
import { writeAndValidate } from "./detect-knowledge-bits-chunk.js";
import type { GenerateItemsDeps } from "./detect-knowledge-bits.types.js";

vi.mock("../shared/log.js", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function depsWithModel() {
  const writeItems = vi.fn().mockResolvedValue([]);

  return { deps: { writeItems } as unknown as GenerateItemsDeps, writeItems };
}

describe("writeAndValidate with imported cloze notes", () => {
  it("should not call the model for a cloze note, even with fusion models", async () => {
    const { deps, writeItems } = depsWithModel();
    const result = await writeAndValidate(
      "A deal needs {{c1::budget}} and {{c2::authority}}.",
      { ankiImport: true, fusionModelIds: ["a", "b", "c"] } as never,
      deps,
    );

    expect(writeItems).not.toHaveBeenCalled();
    expect(result.flagged).toEqual([]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]?.cards[0]?.kind).toBe("cloze");
  });

  it("should call the model for prose", async () => {
    const { deps, writeItems } = depsWithModel();

    await writeAndValidate("HTTP is stateless.", {} as never, deps).catch(() => undefined);

    expect(writeItems).toHaveBeenCalled();
  });

  it("should call the model for a cloze note from a source that is not an Anki import", async () => {
    const { deps, writeItems } = depsWithModel();

    await writeAndValidate("A deal needs {{c1::budget}}.", {} as never, deps).catch(() => undefined);

    expect(writeItems).toHaveBeenCalled();
  });

  it("should call the model for an Anki note whose plain text carries injected markup", async () => {
    const { deps, writeItems } = depsWithModel();

    await writeAndValidate("See <{{c1::b}}old> now.", { ankiImport: true } as never, deps).catch(() => undefined);

    expect(writeItems).toHaveBeenCalled();
  });
});
