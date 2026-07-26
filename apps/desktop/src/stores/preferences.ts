import {
  applyTheme,
  listThemes,
  resolveThemeSettings,
  type Appearance,
  type ResolvedAppearance,
  type ResolvedTheme,
} from "@crono/theme";
import type { Settings } from "@crono/client-core";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { i18n, type SupportedLocale } from "../i18n";

const STORAGE_KEY = "crono:preferences";

interface StoredPreferences {
  appearance: Appearance;
  themeLight: string;
  themeDark: string;
  locale: SupportedLocale;
}

const defaults: StoredPreferences = {
  appearance: "system",
  themeLight: "crono-light",
  themeDark: "crono-dark",
  locale: i18n.global.locale.value as SupportedLocale,
};

function readStoredPreferences(): StoredPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<StoredPreferences>;
    return {
      appearance:
        value.appearance === "light" ||
        value.appearance === "dark" ||
        value.appearance === "system"
          ? value.appearance
          : defaults.appearance,
      themeLight: value.themeLight ?? defaults.themeLight,
      themeDark: value.themeDark ?? defaults.themeDark,
      locale:
        value.locale === "en-US" || value.locale === "zh-CN"
          ? value.locale
          : defaults.locale,
    };
  } catch {
    return defaults;
  }
}

export const usePreferencesStore = defineStore("preferences", () => {
  const stored = readStoredPreferences();
  const appearance = ref<Appearance>(stored.appearance);
  const themeLight = ref(stored.themeLight);
  const themeDark = ref(stored.themeDark);
  const locale = ref<SupportedLocale>(stored.locale);
  const systemAppearance = ref<ResolvedAppearance>(
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  const initialized = ref(false);

  const activeTheme = computed<ResolvedTheme>(() =>
    resolveThemeSettings(
      {
        appearance: appearance.value,
        themeLight: themeLight.value,
        themeDark: themeDark.value,
      },
      systemAppearance.value,
    ),
  );
  const lightThemes = computed(() => listThemes("light"));
  const darkThemes = computed(() => listThemes("dark"));

  function persistAndApply() {
    const value: StoredPreferences = {
      appearance: appearance.value,
      themeLight: themeLight.value,
      themeDark: themeDark.value,
      locale: locale.value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    localStorage.setItem("crono:locale", locale.value);
    i18n.global.locale.value = locale.value;
    document.documentElement.lang = locale.value;
    applyTheme(activeTheme.value);
  }

  function initialize() {
    if (initialized.value) return;
    initialized.value = true;
    persistAndApply();

    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", (event) => {
      systemAppearance.value = event.matches ? "dark" : "light";
      persistAndApply();
    });
  }

  function applyPersistedSettings(settings: Settings) {
    appearance.value = settings.appearance;
    themeLight.value = settings.themeLight;
    themeDark.value = settings.themeDark;
    locale.value =
      settings.locale === "zh-CN" || settings.locale === "en-US"
        ? settings.locale
        : defaults.locale;
    persistAndApply();
  }

  function setAppearance(value: Appearance) {
    appearance.value = value;
    persistAndApply();
  }

  function setLightTheme(value: string) {
    themeLight.value = value;
    persistAndApply();
  }

  function setDarkTheme(value: string) {
    themeDark.value = value;
    persistAndApply();
  }

  function setLocale(value: SupportedLocale) {
    locale.value = value;
    persistAndApply();
  }

  function toggleAppearance() {
    const current = activeTheme.value.appearance;
    setAppearance(current === "dark" ? "light" : "dark");
  }

  return {
    appearance,
    themeLight,
    themeDark,
    locale,
    systemAppearance,
    activeTheme,
    lightThemes,
    darkThemes,
    initialize,
    applyPersistedSettings,
    setAppearance,
    setLightTheme,
    setDarkTheme,
    setLocale,
    toggleAppearance,
  };
});
