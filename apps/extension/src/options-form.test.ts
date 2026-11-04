import { describe, expect, it, vi } from "vitest";

import { bindOptionsForm, type OptionsFormDeps, type OptionsFormElements } from "./options-form.js";

type Listener = (event: { preventDefault: () => void }) => void | Promise<void>;

function fakeTarget() {
  const listeners = new Map<string, Listener[]>();

  return {
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    fire: async (type: string) => {
      const preventDefault = vi.fn();

      for (const listener of listeners.get(type) ?? []) {
        await listener({ preventDefault });
      }

      return preventDefault;
    },
  };
}

function setup(save: OptionsFormDeps["save"] = vi.fn(async () => ({ ok: true as const }))) {
  const form = fakeTarget();
  const field = fakeTarget();
  const saveButton = { disabled: false };
  const status = { textContent: "" as string | null };
  const afterSave = vi.fn(async () => {});
  const saveSpy = vi.mocked(save);
  const input = { baseUrl: "http://api", token: "t", webUrl: "http://web", subjectId: "" };
  const elements: OptionsFormElements = {
    form,
    fields: [field],
    saveButton,
    status,
    read: () => input,
  };

  bindOptionsForm(elements, { save, afterSave });

  return { form, field, saveButton, status, save: saveSpy, afterSave, input };
}

describe("bindOptionsForm", () => {
  it("should save the fields and show Saved. when the form is submitted, as Enter does", async () => {
    const { form, status, save, afterSave, input } = setup();

    const preventDefault = await form.fire("submit");

    expect(preventDefault).toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(input);
    expect(status.textContent).toBe("Saved.");
    expect(afterSave).toHaveBeenCalledTimes(1);
  });

  it("should clear the status as soon as a field changes", async () => {
    const { form, field, status } = setup();

    await form.fire("submit");
    await field.fire("input");

    expect(status.textContent).toBe("");
  });

  it("should disable Save while saving and enable it afterwards", async () => {
    let release: () => void = () => {};
    const save = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          release = () => resolve({ ok: true });
        }),
    );
    const { form, saveButton } = setup(save);

    const pending = form.fire("submit");

    expect(saveButton.disabled).toBe(true);
    release();
    await pending;
    expect(saveButton.disabled).toBe(false);
  });

  it("should ignore a second submit while one is saving", async () => {
    let release: () => void = () => {};
    const save = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          release = () => resolve({ ok: true });
        }),
    );
    const { form } = setup(save);

    const first = form.fire("submit");

    await form.fire("submit");
    release();
    await first;

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("should show the invalid-URL message and skip the refresh when the address is bad", async () => {
    const save = vi.fn(async () => ({ ok: false as const, reason: "invalid_web_url" as const }));
    const { form, status, afterSave } = setup(save);

    await form.fire("submit");

    expect(status.textContent).toBe("Web app address must be a valid http(s) URL.");
    expect(afterSave).not.toHaveBeenCalled();
  });

  it("should clear the previous message before a new save attempt", async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: "invalid_base_url" })
      .mockResolvedValueOnce({ ok: true });
    const { form, status } = setup(save);

    await form.fire("submit");
    expect(status.textContent).toBe("Base URL must be a valid http(s) URL.");

    await form.fire("submit");
    expect(status.textContent).toBe("Saved.");
  });
});
