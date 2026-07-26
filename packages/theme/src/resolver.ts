import {
  bestForeground,
  contrastRatio,
  mixColors,
  parseCssColor,
} from "./color";
import { builtinThemes, cronoDark, cronoLight } from "./builtins";
import type {
  Appearance,
  ResolvedAppearance,
  ResolvedTheme,
  SyntaxColorTokens,
  ThemeColorTokens,
  ThemeContrastIssue,
  ThemeDefinition,
  ThemeSettings,
} from "./types";

const themeRegistry = new Map(
  builtinThemes.map((theme) => [theme.id, theme]),
);

function resolveBase(theme: ThemeDefinition): ThemeColorTokens {
  const source = theme.base;
  const surfaceRaised =
    source.surfaceRaised ??
    mixColors(source.text, source.surface, theme.appearance === "dark" ? 0.06 : 0.025);
  const surfaceHighlight =
    source.surfaceHighlight ??
    mixColors(source.text, source.surface, theme.appearance === "dark" ? 0.12 : 0.07);
  const primaryForeground =
    source.primaryForeground ?? bestForeground(source.primary);
  const danger = source.danger ?? "hsl(0, 72%, 52%)";

  return {
    surface: source.surface,
    surfaceRaised,
    surfaceHighlight,
    surfaceActive:
      source.surfaceActive ?? mixColors(source.primary, source.surface, 0.18),
    text: source.text,
    textMuted:
      source.textMuted ?? mixColors(source.text, source.surface, 0.72),
    textSubtle:
      source.textSubtle ?? mixColors(source.text, source.surface, 0.56),
    border:
      source.border ?? mixColors(source.text, source.surface, 0.2),
    borderSubtle:
      source.borderSubtle ?? mixColors(source.text, source.surface, 0.12),
    borderFocus: source.borderFocus ?? source.primary,
    primary: source.primary,
    primaryForeground,
    secondary:
      source.secondary ?? mixColors(source.text, source.surface, 0.68),
    secondaryForeground:
      source.secondaryForeground ??
      bestForeground(
        source.secondary ?? mixColors(source.text, source.surface, 0.68),
      ),
    info: source.info ?? "hsl(210, 90%, 56%)",
    success: source.success ?? "hsl(150, 65%, 42%)",
    notice: source.notice ?? "hsl(45, 85%, 50%)",
    warning: source.warning ?? "hsl(28, 90%, 54%)",
    danger,
    dangerForeground:
      source.dangerForeground ?? bestForeground(danger),
    selection:
      source.selection ?? mixColors(source.primary, source.surface, 0.28),
    focusRing: source.focusRing ?? source.primary,
    shadow: source.shadow ?? "#000000",
    backdrop: source.backdrop ?? "#000000",
  };
}

function resolveSyntax(
  theme: ThemeDefinition,
  base: ThemeColorTokens,
): SyntaxColorTokens {
  return {
    comment: theme.syntax?.comment ?? base.textSubtle,
    keyword: theme.syntax?.keyword ?? base.primary,
    string: theme.syntax?.string ?? base.success,
    number: theme.syntax?.number ?? base.notice,
    property: theme.syntax?.property ?? base.info,
    type: theme.syntax?.type ?? base.warning,
    function: theme.syntax?.function ?? base.primary,
    variable: theme.syntax?.variable ?? base.text,
    operator: theme.syntax?.operator ?? base.textMuted,
    invalid: theme.syntax?.invalid ?? base.danger,
  };
}

export function getThemeDefinition(
  id: string,
  appearance?: ResolvedAppearance,
): ThemeDefinition {
  const found = themeRegistry.get(id);
  if (found && (!appearance || found.appearance === appearance)) return found;
  return appearance === "dark" ? cronoDark : cronoLight;
}

export function resolveTheme(theme: ThemeDefinition): ResolvedTheme {
  const base = resolveBase(theme);
  const components = Object.fromEntries(
    Object.entries(theme.components ?? {}).map(([key, value]) => [
      key,
      { ...base, ...value },
    ]),
  ) as ResolvedTheme["components"];

  return {
    ...theme,
    base,
    components,
    syntax: resolveSyntax(theme, base),
  };
}

export function resolveAppearance(
  preference: Appearance,
  systemAppearance: ResolvedAppearance,
): ResolvedAppearance {
  return preference === "system" ? systemAppearance : preference;
}

export function resolveThemeSettings(
  settings: ThemeSettings,
  systemAppearance: ResolvedAppearance,
): ResolvedTheme {
  const appearance = resolveAppearance(settings.appearance, systemAppearance);
  const id = appearance === "dark" ? settings.themeDark : settings.themeLight;
  return resolveTheme(getThemeDefinition(id, appearance));
}

function toKebab(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function themeToCssVariables(theme: ResolvedTheme): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [name, value] of Object.entries(theme.base)) {
    variables[`--crono-${toKebab(name)}`] = value;
  }
  for (const [name, value] of Object.entries(theme.syntax)) {
    variables[`--syntax-${toKebab(name)}`] = value;
  }

  const componentToken = (
    component: keyof ResolvedTheme["components"],
    token: keyof ThemeColorTokens,
  ) => theme.components[component]?.[token] ?? theme.base[token];

  Object.assign(variables, {
    "--background": theme.base.surface,
    "--foreground": theme.base.text,
    "--card": theme.base.surfaceRaised,
    "--card-foreground": theme.base.text,
    "--popover": theme.base.surfaceRaised,
    "--popover-foreground": theme.base.text,
    "--primary": theme.base.primary,
    "--primary-foreground": theme.base.primaryForeground,
    "--secondary": theme.base.secondary,
    "--secondary-foreground": theme.base.secondaryForeground,
    "--muted": theme.base.surfaceHighlight,
    "--muted-foreground": theme.base.textMuted,
    "--accent": theme.base.surfaceActive,
    "--accent-foreground": theme.base.text,
    "--destructive": theme.base.danger,
    "--destructive-foreground": theme.base.dangerForeground,
    "--border": theme.base.border,
    "--input": theme.base.border,
    "--ring": theme.base.focusRing,
    "--sidebar": componentToken("sidebar", "surface"),
    "--sidebar-foreground": componentToken("sidebar", "text"),
    "--sidebar-border": componentToken("sidebar", "border"),
    "--app-header": componentToken("appHeader", "surface"),
    "--response-pane": componentToken("responsePane", "surface"),
    "--editor": componentToken("editor", "surface"),
  });

  return variables;
}

export function applyTheme(theme: ResolvedTheme, target = document.documentElement): void {
  for (const [name, value] of Object.entries(themeToCssVariables(theme))) {
    target.style.setProperty(name, value);
  }
  target.dataset.theme = theme.id;
  target.dataset.appearance = theme.appearance;
  target.style.colorScheme = theme.appearance;
}

export function validateTheme(theme: ResolvedTheme): ThemeContrastIssue[] {
  const requiredColors = Object.entries(theme.base);
  for (const [name, color] of requiredColors) {
    if (!parseCssColor(color)) {
      throw new Error(`Theme ${theme.id} has invalid color token ${name}: ${color}`);
    }
  }

  const pairs: Array<[string, string, string, number]> = [
    ["text/surface", theme.base.text, theme.base.surface, 4.5],
    ["muted/surface", theme.base.textMuted, theme.base.surface, 4.5],
    ["primary foreground", theme.base.primaryForeground, theme.base.primary, 4.5],
    ["danger foreground", theme.base.dangerForeground, theme.base.danger, 4.5],
    ["focus/surface", theme.base.focusRing, theme.base.surface, 3],
  ];

  return pairs.flatMap(([pair, foreground, background, required]) => {
    const actual = contrastRatio(foreground, background);
    if (actual === null || actual >= required) return [];
    return [{ pair, actual, required }];
  });
}

export function listThemes(appearance?: ResolvedAppearance): ThemeDefinition[] {
  return builtinThemes.filter(
    (theme) => !appearance || theme.appearance === appearance,
  );
}

