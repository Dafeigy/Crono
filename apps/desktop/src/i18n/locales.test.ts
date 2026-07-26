import { describe, expect, it } from "vitest";
import enUS from "./locales/en-US";
import zhCN from "./locales/zh-CN";

function flattenKeys(
  value: Record<string, unknown>,
  prefix = "",
): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object"
      ? flattenKeys(child as Record<string, unknown>, path)
      : [path];
  });
}

describe("locale resources", () => {
  it("keeps English and Chinese message keys aligned", () => {
    expect(flattenKeys(zhCN).sort()).toEqual(flattenKeys(enUS).sort());
  });

  it("does not contain blank messages", () => {
    const values = JSON.stringify({ enUS, zhCN });
    expect(values).not.toContain(':""');
  });
});

