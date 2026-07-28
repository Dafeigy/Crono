export type ShortcutId =
  | "focusRequestUrl"
  | "toggleSidebar"
  | "newRequest"
  | "switchRequest"
  | "commandPalette"
  | "sendRequest"
  | "renameRequest"
  | "nextRequest"
  | "previousRequest"
  | "focusSidebar"
  | "nextRequestVim"
  | "previousRequestVim"
  | "searchRequests"
  | "openSettings";

export interface ShortcutDefinition {
  id: ShortcutId;
  keys: string[];
  category: "request" | "navigation" | "application";
}

export const SHORTCUTS: ShortcutDefinition[] = [
  { id: "focusRequestUrl", keys: ["Ctrl", "L"], category: "request" },
  { id: "sendRequest", keys: ["Ctrl", "Enter"], category: "request" },
  { id: "renameRequest", keys: ["Ctrl", "M"], category: "request" },
  { id: "newRequest", keys: ["Ctrl", "N"], category: "request" },
  { id: "switchRequest", keys: ["Ctrl", "P"], category: "navigation" },
  { id: "nextRequest", keys: ["Ctrl", "Tab"], category: "navigation" },
  {
    id: "previousRequest",
    keys: ["Ctrl", "Shift", "Tab"],
    category: "navigation",
  },
  { id: "toggleSidebar", keys: ["Ctrl", "B"], category: "navigation" },
  { id: "focusSidebar", keys: ["Ctrl", "H"], category: "navigation" },
  { id: "nextRequestVim", keys: ["Ctrl", "J"], category: "navigation" },
  { id: "previousRequestVim", keys: ["Ctrl", "K"], category: "navigation" },
  { id: "searchRequests", keys: ["Ctrl", "F"], category: "navigation" },
  { id: "commandPalette", keys: ["Ctrl", "`"], category: "application" },
  { id: "openSettings", keys: ["Ctrl", ","], category: "application" },
];

export function shortcutLabel(id: ShortcutId) {
  return SHORTCUTS.find((shortcut) => shortcut.id === id)?.keys.join("+") ?? "";
}

interface ShortcutKeyboardEvent {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  key: string;
  shiftKey: boolean;
}

export function requestSwitchOffset(
  event: Pick<
    ShortcutKeyboardEvent,
    "altKey" | "ctrlKey" | "key" | "shiftKey"
  >,
) {
  if (!event.ctrlKey || event.altKey) return undefined;
  const key = event.key.toLocaleLowerCase();
  if (event.key === "Tab") return event.shiftKey ? -1 : 1;
  if (!event.shiftKey && key === "j") return 1;
  if (!event.shiftKey && key === "k") return -1;
  return undefined;
}

export function isCommandPaletteShortcut(
  event: Pick<
    ShortcutKeyboardEvent,
    "altKey" | "code" | "ctrlKey" | "key" | "shiftKey"
  >,
) {
  return (
    event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    (event.key === "`" || event.code === "Backquote")
  );
}
