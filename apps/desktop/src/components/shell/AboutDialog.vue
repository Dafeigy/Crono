<script setup lang="ts">
import { Info, X } from "lucide-vue-next";
import { onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";

const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div class="app-dialog-backdrop" @pointerdown.self="emit('close')">
    <section
      class="app-dialog about-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-dialog-title"
    >
      <button
        class="dialog-close-button"
        type="button"
        :aria-label="t('common.close')"
        :title="t('common.close')"
        @click="emit('close')"
      >
        <X :size="15" aria-hidden="true" />
      </button>
      <div class="about-dialog-mark">
        <Info :size="22" aria-hidden="true" />
      </div>
      <h2 id="about-dialog-title">{{ t("about.title") }}</h2>
      <p>{{ t("about.description") }}</p>
      <span>{{ t("about.version", { version: "0.1.0" }) }}</span>
    </section>
  </div>
</template>
