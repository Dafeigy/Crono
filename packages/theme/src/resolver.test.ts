import { describe, expect, it } from "vitest";
import { builtinThemes } from "./builtins";
import {
  getThemeDefinition,
  resolveTheme,
  resolveThemeSettings,
  themeToCssVariables,
  validateTheme,
} from "./resolver";

describe("theme resolver", () => {
  it("resolves every built-in theme to complete variables", () => {
    for (const definition of builtinThemes) {
      const theme = resolveTheme(definition);
      const variables = themeToCssVariables(theme);
      expect(Object.values(theme.base).every(Boolean)).toBe(true);
      expect(variables["--background"]).toBe(theme.base.surface);
      expect(variables["--primary"]).toBe(theme.base.primary);
    }
  });

  it("falls back to a matching Crono theme", () => {
    expect(getThemeDefinition("missing", "light").id).toBe("crono-light");
    expect(getThemeDefinition("missing", "dark").id).toBe("crono-dark");
  });

  it("resolves the system appearance", () => {
    const theme = resolveThemeSettings(
      {
        appearance: "system",
        themeLight: "github-light",
        themeDark: "tokyo-night",
      },
      "dark",
    );
    expect(theme.id).toBe("tokyo-night");
  });

  it("validates all built-in colors and contrast pairs", () => {
    for (const definition of builtinThemes) {
      const issues = validateTheme(resolveTheme(definition));
      expect(issues, definition.id).toEqual([]);
    }
  });
});

