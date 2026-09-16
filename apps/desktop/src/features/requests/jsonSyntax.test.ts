import { describe, expect, it } from "vitest";
import { jsonSyntaxError } from "./jsonSyntax";

describe("jsonSyntaxError", () => {
  it("accepts valid JSON documents", () => {
    expect(jsonSyntaxError('{"enabled": true}')).toBeUndefined();
  });

  it("returns an error for invalid JSON documents", () => {
    expect(jsonSyntaxError('{"enabled": }')).toBeTruthy();
  });
});
