import { describe, expect, it } from "vitest";
import { buildCallback } from "../nav/callback.js";
import { buildCheckpointKeyboard } from "./session-checkpoint-view.js";

describe("buildCheckpointKeyboard", () => {
  it("renders exactly one 'Continue now' button by default, reusing the existing continue callback verbatim (AC 14, 12)", () => {
    const keyboard = buildCheckpointKeyboard();

    const buttons = keyboard.flat();

    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.text).toContain("Continue now");
    expect("callback_data" in buttons[0]! && buttons[0]!.callback_data).toBe(
      buildCallback("continue"),
    );
  });

  it("renders exactly one button when isIntensityMode is explicitly false (AC 14)", () => {
    const keyboard = buildCheckpointKeyboard(false);

    expect(keyboard.flat()).toHaveLength(1);
  });

  it("renders a second 'Save for next session' button when isIntensityMode is true (AC 14)", () => {
    const keyboard = buildCheckpointKeyboard(true);
    const buttons = keyboard.flat();

    expect(buttons).toHaveLength(2);
    expect(buttons[1]!.text).toContain("Save for next session");
  });

  it("wires the second button to the real save_for_next CallbackKind (AC 25)", () => {
    const keyboard = buildCheckpointKeyboard(true);
    const buttons = keyboard.flat();

    expect("callback_data" in buttons[1]! && buttons[1]!.callback_data).toBe(
      buildCallback("save_for_next"),
    );
  });
});
