<script setup lang="ts">
import { Button } from "@crono/ui";
import {
  Check,
  Moon,
  Palette,
  Sun,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { usePreferencesStore } from "../../../stores/preferences";

const { t } = useI18n();
const preferences = usePreferencesStore();
</script>

<template>
  <section class="settings-page">
    <header class="settings-header">
      <div>
        <h1>{{ t("settings.title") }}</h1>
        <p>{{ t("settings.description") }}</p>
      </div>
    </header>

    <div class="settings-grid">
      <article class="settings-card">
        <div class="settings-card-heading">
          <Palette :size="19" />
          <div>
            <h2>{{ t("settings.appearance") }}</h2>
            <p>{{ t("settings.appearanceDescription") }}</p>
          </div>
        </div>

        <div class="segmented-control">
          <button
            v-for="mode in (['system', 'light', 'dark'] as const)"
            :key="mode"
            type="button"
            :class="{ 'is-active': preferences.appearance === mode }"
            @click="preferences.setAppearance(mode)"
          >
            <Check
              v-if="preferences.appearance === mode"
              :size="13"
              aria-hidden="true"
            />
            {{ t(`settings.${mode}`) }}
          </button>
        </div>

        <div class="setting-field">
          <label for="light-theme">
            <Sun :size="15" />
            {{ t("settings.lightTheme") }}
          </label>
          <select
            id="light-theme"
            :value="preferences.themeLight"
            @change="
              preferences.setLightTheme(
                ($event.target as HTMLSelectElement).value,
              )
            "
          >
            <option
              v-for="theme in preferences.lightThemes"
              :key="theme.id"
              :value="theme.id"
            >
              {{ t(theme.labelKey) }}
            </option>
          </select>
        </div>

        <div class="setting-field">
          <label for="dark-theme">
            <Moon :size="15" />
            {{ t("settings.darkTheme") }}
          </label>
          <select
            id="dark-theme"
            :value="preferences.themeDark"
            @change="
              preferences.setDarkTheme(
                ($event.target as HTMLSelectElement).value,
              )
            "
          >
            <option
              v-for="theme in preferences.darkThemes"
              :key="theme.id"
              :value="theme.id"
            >
              {{ t(theme.labelKey) }}
            </option>
          </select>
        </div>
      </article>

      <article class="settings-card">
        <div class="settings-card-heading">
          <div class="language-icon" aria-hidden="true">Aa</div>
          <div>
            <h2>{{ t("settings.language") }}</h2>
            <p>{{ t("settings.languageDescription") }}</p>
          </div>
        </div>
        <div class="language-options">
          <Button
            :variant="preferences.locale === 'zh-CN' ? 'default' : 'outline'"
            @click="preferences.setLocale('zh-CN')"
          >
            简体中文
          </Button>
          <Button
            :variant="preferences.locale === 'en-US' ? 'default' : 'outline'"
            @click="preferences.setLocale('en-US')"
          >
            English
          </Button>
        </div>
      </article>

      <article class="settings-card theme-preview-card">
        <div class="settings-card-heading">
          <div class="preview-swatch" />
          <div>
            <h2>{{ t("settings.themePreview") }}</h2>
            <p>{{ t("settings.themePreviewDescription") }}</p>
          </div>
        </div>
        <div class="theme-swatches">
          <span class="swatch primary" />
          <span class="swatch info" />
          <span class="swatch success" />
          <span class="swatch notice" />
          <span class="swatch warning" />
          <span class="swatch danger" />
        </div>
        <div class="preview-code">
          <span class="syntax-keyword">const</span>
          <span class="syntax-variable"> response</span>
          <span class="syntax-operator"> = </span>
          <span class="syntax-function">await</span>
          <span class="syntax-property"> client</span>
          <span class="syntax-operator">.</span>
          <span class="syntax-function">send</span>
          <span class="syntax-operator">(</span>
          <span class="syntax-string">"/health"</span>
          <span class="syntax-operator">)</span>
        </div>
      </article>
    </div>
  </section>
</template>
