<script setup lang="ts">
import { Keyboard, X } from "lucide-vue-next";
import { onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { SHORTCUTS } from "../../shortcuts";

const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const shortcutCategories = ["request", "navigation", "application"] as const;

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div class="app-dialog-backdrop" @pointerdown.self="emit('close')">
    <section
      class="app-dialog shortcuts-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-dialog-title"
    >
      <header class="shortcuts-dialog-header">
        <div class="shortcuts-dialog-icon">
          <Keyboard :size="18" aria-hidden="true" />
        </div>
        <div>
          <h2 id="shortcuts-dialog-title">{{ t("shortcuts.title") }}</h2>
          <p>{{ t("shortcuts.description") }}</p>
        </div>
        <button
          class="dialog-close-button"
          type="button"
          :aria-label="t('common.close')"
          :title="t('common.close')"
          @click="emit('close')"
        >
          <X :size="15" aria-hidden="true" />
        </button>
      </header>

      <div class="shortcuts-dialog-content">
        <section
          v-for="category in shortcutCategories"
          :key="category"
          class="shortcut-group"
        >
          <h3>{{ t(`shortcuts.categories.${category}`) }}</h3>
          <div class="shortcut-list">
            <div
              v-for="shortcut in SHORTCUTS.filter((item) => item.category === category)"
              :key="shortcut.id"
              class="shortcut-row"
            >
              <span>{{ t(`shortcuts.actions.${shortcut.id}`) }}</span>
              <span class="shortcut-keys" :aria-label="shortcut.keys.join(' + ')">
                <kbd v-for="key in shortcut.keys" :key="key">{{ key }}</kbd>
              </span>
            </div>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>
