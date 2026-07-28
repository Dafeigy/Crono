import { describe, expect, it } from "vitest";
import { settingsReturnPath } from "./settingsNavigation";

describe("settings navigation", () => {
  it("returns to the recorded application page", () => {
    expect(settingsReturnPath("/?request=request-1")).toBe(
      "/?request=request-1",
    );
    expect(settingsReturnPath(["/environments"])).toBe("/environments");
  });

  it("falls back to the request page for invalid or recursive sources", () => {
    expect(settingsReturnPath(undefined)).toBe("/");
    expect(settingsReturnPath("https://example.com")).toBe("/");
    expect(settingsReturnPath("/settings?from=/")).toBe("/");
  });
});
