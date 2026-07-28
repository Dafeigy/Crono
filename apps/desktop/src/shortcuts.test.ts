import { describe, expect, it } from "vitest";
import {
  isCommandPaletteShortcut,
  requestSwitchOffset,
  SHORTCUTS,
  shortcutLabel,
} from "./shortcuts";

describe("default shortcuts", () => {
  it("defines each requested shortcut exactly once", () => {
    expect(SHORTCUTS).toHaveLength(14);
    expect(new Set(SHORTCUTS.map(({ id }) => id)).size).toBe(14);
  });

  it("formats shortcut labels for tooltips and menus", () => {
    expect(shortcutLabel("focusRequestUrl")).toBe("Ctrl+L");
    expect(shortcutLabel("previousRequest")).toBe("Ctrl+Shift+Tab");
    expect(shortcutLabel("openSettings")).toBe("Ctrl+,");
    expect(shortcutLabel("focusSidebar")).toBe("Ctrl+H");
    expect(shortcutLabel("commandPalette")).toBe("Ctrl+`");
    expect(shortcutLabel("renameRequest")).toBe("Ctrl+M");
  });

  it("maps Vim request switching to the same offsets as Ctrl+Tab", () => {
    const base = { altKey: false, ctrlKey: true, shiftKey: false };
    expect(requestSwitchOffset({ ...base, key: "Tab" })).toBe(1);
    expect(requestSwitchOffset({ ...base, key: "Tab", shiftKey: true })).toBe(
      -1,
    );
    expect(requestSwitchOffset({ ...base, key: "j" })).toBe(1);
    expect(requestSwitchOffset({ ...base, key: "k" })).toBe(-1);
  });

  it("opens the command palette only with Ctrl+backquote", () => {
    expect(
      isCommandPaletteShortcut({
        altKey: false,
        code: "Backquote",
        ctrlKey: true,
        key: "`",
        shiftKey: false,
      }),
    ).toBe(true);
    expect(
      isCommandPaletteShortcut({
        altKey: false,
        code: "KeyK",
        ctrlKey: true,
        key: "k",
        shiftKey: false,
      }),
    ).toBe(false);
    expect(
      isCommandPaletteShortcut({
        altKey: false,
        code: "Semicolon",
        ctrlKey: true,
        key: ":",
        shiftKey: true,
      }),
    ).toBe(false);
  });
});
