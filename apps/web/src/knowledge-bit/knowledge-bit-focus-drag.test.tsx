// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  resolveVerticalDrag,
  useVerticalDrag,
  VERTICAL_DRAG_PX,
} from "./knowledge-bit-focus-drag";

const TOP = { atTop: true, atBottom: false };
const BOTTOM = { atTop: false, atBottom: true };
const MIDDLE = { atTop: false, atBottom: false };

describe("resolveVerticalDrag", () => {
  it("should treat a 96 px drag down from the top edge as chat", () => {
    expect(resolveVerticalDrag({ y: 0, ...TOP }, VERTICAL_DRAG_PX, TOP)).toBe(
      "down",
    );
  });

  it("should ignore a shorter drag", () => {
    expect(
      resolveVerticalDrag({ y: 0, ...TOP }, VERTICAL_DRAG_PX - 1, TOP),
    ).toBeNull();
  });

  it("should ignore a drag down in the middle of a scrolled card", () => {
    expect(resolveVerticalDrag({ y: 0, ...MIDDLE }, 200, MIDDLE)).toBeNull();
  });

  it("should ignore a drag down that scrolled the card away from the top", () => {
    expect(resolveVerticalDrag({ y: 0, ...TOP }, 200, MIDDLE)).toBeNull();
  });

  it("should treat a 96 px drag up from the bottom edge as an example request", () => {
    expect(
      resolveVerticalDrag(
        { y: 300, ...BOTTOM },
        300 - VERTICAL_DRAG_PX,
        BOTTOM,
      ),
    ).toBe("up");
  });

  it("should ignore a drag up that does not start at the bottom edge", () => {
    expect(resolveVerticalDrag({ y: 300, ...TOP }, 0, BOTTOM)).toBeNull();
  });
});

function Surface({
  onDrag,
  enabled = true,
}: {
  onDrag: (d: "down" | "up") => void;
  enabled?: boolean;
}) {
  const drag = useVerticalDrag({ enabled, onDrag });

  return (
    <div data-testid="surface" {...drag}>
      <textarea data-testid="field" />
    </div>
  );
}

function touch(target: Element, type: "touchStart" | "touchEnd", y: number) {
  const point = { clientY: y, clientX: 0, identifier: 1, target };

  fireEvent[type](target, {
    touches: type === "touchStart" ? [point] : [],
    changedTouches: [point],
  });
}

afterEach(cleanup);

describe("useVerticalDrag", () => {
  it("should report a touch drag down on a card that fits the screen", () => {
    const onDrag = vi.fn();

    render(<Surface onDrag={onDrag} />);
    touch(screen.getByTestId("surface"), "touchStart", 10);
    touch(screen.getByTestId("surface"), "touchEnd", 120);

    expect(onDrag).toHaveBeenCalledWith("down");
  });

  it("should report a touch drag up", () => {
    const onDrag = vi.fn();

    render(<Surface onDrag={onDrag} />);
    touch(screen.getByTestId("surface"), "touchStart", 300);
    touch(screen.getByTestId("surface"), "touchEnd", 100);

    expect(onDrag).toHaveBeenCalledWith("up");
  });

  it("should never react to a mouse drag so text selection keeps working", () => {
    const onDrag = vi.fn();

    render(<Surface onDrag={onDrag} />);
    fireEvent.pointerDown(screen.getByTestId("surface"), {
      pointerType: "mouse",
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByTestId("surface"), {
      pointerType: "mouse",
      clientY: 200,
    });

    expect(onDrag).not.toHaveBeenCalled();
  });

  it("should report a pen drag down", () => {
    const onDrag = vi.fn();

    render(<Surface onDrag={onDrag} />);
    fireEvent.pointerDown(screen.getByTestId("surface"), {
      pointerType: "pen",
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByTestId("surface"), {
      pointerType: "pen",
      clientY: 200,
    });

    expect(onDrag).toHaveBeenCalledWith("down");
  });

  it("should ignore a drag that starts in a text field", () => {
    const onDrag = vi.fn();

    render(<Surface onDrag={onDrag} />);
    touch(screen.getByTestId("field"), "touchStart", 10);
    touch(screen.getByTestId("surface"), "touchEnd", 200);

    expect(onDrag).not.toHaveBeenCalled();
  });

  it("should ignore a touch drag that ended with text selected", () => {
    const onDrag = vi.fn();

    render(<Surface onDrag={onDrag} />);

    const range = document.createRange();

    range.selectNodeContents(screen.getByTestId("surface"));
    window.getSelection()?.addRange(range);
    window.getSelection()?.removeAllRanges();
    const field = screen.getByTestId("field") as HTMLTextAreaElement;
    const text = document.createElement("p");

    text.textContent = "selected words";
    screen.getByTestId("surface").appendChild(text);
    touch(text, "touchStart", 10);
    range.selectNodeContents(text);
    window.getSelection()?.addRange(range);
    touch(text, "touchEnd", 200);
    window.getSelection()?.removeAllRanges();

    expect(field).toBeTruthy();
    expect(onDrag).not.toHaveBeenCalled();
  });

  it("should ignore drags while actions are disabled", () => {
    const onDrag = vi.fn();

    render(<Surface onDrag={onDrag} enabled={false} />);
    touch(screen.getByTestId("surface"), "touchStart", 10);
    touch(screen.getByTestId("surface"), "touchEnd", 200);

    expect(onDrag).not.toHaveBeenCalled();
  });
});
