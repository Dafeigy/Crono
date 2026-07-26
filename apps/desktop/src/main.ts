import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia } from "pinia";
import { createApp, watch } from "vue";
import App from "./App.vue";
import { i18n } from "./i18n";
import { router } from "./router";
import { usePreferencesStore } from "./stores/preferences";
import { useModelsStore } from "./stores/models";
import "./styles.css";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(i18n);
app.use(VueQueryPlugin);

const preferences = usePreferencesStore(pinia);
const models = useModelsStore(pinia);
preferences.initialize();
void models.initialize().then(() => {
  preferences.applyPersistedSettings(models.settings);
  const preferencesMatchSettings = () =>
    models.settings.appearance === preferences.appearance &&
    models.settings.themeLight === preferences.themeLight &&
    models.settings.themeDark === preferences.themeDark &&
    models.settings.locale === preferences.locale;

  watch(
    () => models.settings,
    (settings) => {
      if (!preferencesMatchSettings()) {
        preferences.applyPersistedSettings(settings);
      }
    },
  );
  watch(
    [
      () => preferences.appearance,
      () => preferences.themeLight,
      () => preferences.themeDark,
      () => preferences.locale,
    ],
    () => {
      if (preferencesMatchSettings()) return;
      void models
        .queueSettingsUpdate({
          ...models.settings,
          appearance: preferences.appearance,
          themeLight: preferences.themeLight,
          themeDark: preferences.themeDark,
          locale: preferences.locale,
          updatedAt: Math.floor(Date.now() / 1000),
        })
        .catch(() => undefined);
    },
  );
});

app.mount("#app");
