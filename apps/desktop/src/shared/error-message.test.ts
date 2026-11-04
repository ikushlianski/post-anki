import { describe, expect, it } from "vitest";
import { errorMessage } from "@/shared/error-message";

describe("errorMessage", () => {
  it("should show the backend's own sign-in message when the command rejects with text", () => {
    expect(errorMessage("Wrong password", "Sign-in failed")).toBe("Wrong password");
  });

  it("should show the message of a thrown Error", () => {
    expect(errorMessage(new Error("Network down"), "Sign-in failed")).toBe("Network down");
  });

  it("should show the fallback when the rejection carries no usable message", () => {
    expect(errorMessage({ code: 500 }, "Sign-in failed")).toBe("Sign-in failed");
    expect(errorMessage("", "Sign-in failed")).toBe("Sign-in failed");
  });
});
