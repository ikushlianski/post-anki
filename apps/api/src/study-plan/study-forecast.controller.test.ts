import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeRes } from "../shared/fake-http.test-mocks.js";

const getStudyForecast = vi.fn();

vi.mock("./study-forecast.service.js", () => ({
  getStudyForecast: (...args: unknown[]) => getStudyForecast(...args),
}));

const { handleGetStudyForecast } = await import("./study-forecast.controller.js");

describe("handleGetStudyForecast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 400 and skip the lookup when the time zone is invalid", async () => {
    const res = fakeRes();

    await handleGetStudyForecast(res, "s1", "tz=Not/AZone");

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid_input");
    expect(getStudyForecast).not.toHaveBeenCalled();
  });

  it("should answer 404 when the subject does not exist", async () => {
    getStudyForecast.mockResolvedValue(null);
    const res = fakeRes();

    await handleGetStudyForecast(res, "nope", "");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "subject_not_found" });
  });

  it("should answer 200 with the forecast for the requested time zone", async () => {
    getStudyForecast.mockResolvedValue({ intent: "exam" });
    const res = fakeRes();

    await handleGetStudyForecast(res, "s1", "tz=Europe/Warsaw");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ intent: "exam" });
    expect(getStudyForecast).toHaveBeenCalledWith("s1", "Europe/Warsaw");
  });

  it("should forecast without a time zone when none is given", async () => {
    getStudyForecast.mockResolvedValue({ intent: "exam" });

    await handleGetStudyForecast(fakeRes(), "s1", "");

    expect(getStudyForecast).toHaveBeenCalledWith("s1", undefined);
  });
});
