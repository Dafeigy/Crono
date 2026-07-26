import { describe, expect, it } from "vitest";
import { isAppError } from "./errors";

describe("AppError", () => {
  it("accepts the stable IPC error shape", () => {
    expect(
      isAppError({
        code: "http.invalid_url",
        retryable: false,
        params: { value: "not-a-url" },
      }),
    ).toBe(true);
  });

  it("rejects arbitrary thrown values", () => {
    expect(isAppError(new Error("boom"))).toBe(false);
    expect(isAppError({ code: "missing-retryable" })).toBe(false);
  });
});

