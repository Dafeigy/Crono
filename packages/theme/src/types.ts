export type Appearance = "system" | "light" | "dark";
export type ResolvedAppearance = Exclude<Appearance, "system">;

export interface ThemeColorTokens {
  surface: string;
  surfaceRaised: string;
  surfaceHighlight: string;
  surfaceActive: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  border: string;
  borderSubtle: string;
  borderFocus: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  info: string;
  success: string;
  notice: string;
  warning: string;
  danger: string;
  dangerForeground: string;
  selection: string;
  focusRing: string;
  shadow: string;
  backdrop: string;
}

export interface SyntaxColorTokens {
  comment: string;
  keyword: string;
  string: string;
  number: string;
  property: string;
  type: string;
  function: string;
  variable: string;
  operator: string;
  invalid: string;
}

export type ThemeComponent =
  | "appHeader"
  | "sidebar"
  | "requestPane"
  | "responsePane"
  | "dialog"
  | "menu"
  | "toast"
  | "banner"
  | "input"
  | "urlBar"
  | "button"
  | "badge"
  | "templateTag"
  | "editor"
  | "codeGutter";

export interface ThemeAttribution {
  source: string;
  license: string;
  modified?: boolean;
}

export interface ThemeDefinition {
  id: string;
  labelKey: string;
  appearance: ResolvedAppearance;
  base: Pick<ThemeColorTokens, "surface" | "text" | "primary"> &
    Partial<ThemeColorTokens>;
  components?: Partial<
    Record<ThemeComponent, Partial<ThemeColorTokens>>
  >;
  syntax?: Partial<SyntaxColorTokens>;
  attribution?: ThemeAttribution;
}

export interface ResolvedTheme
  extends Omit<ThemeDefinition, "base" | "components" | "syntax"> {
  base: ThemeColorTokens;
  components: Partial<Record<ThemeComponent, ThemeColorTokens>>;
  syntax: SyntaxColorTokens;
}

export interface ThemeSettings {
  appearance: Appearance;
  themeLight: string;
  themeDark: string;
}

export interface ThemeContrastIssue {
  pair: string;
  actual: number;
  required: number;
}

