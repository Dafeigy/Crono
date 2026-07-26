<script setup lang="ts">
import { X } from "lucide-vue-next";
import { onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import EnvironmentsView from "../../features/environments/views/EnvironmentsView.vue";

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
      class="app-dialog environment-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('environment.title')"
    >
      <button
        class="dialog-close-button"
        type="button"
        autofocus
        :aria-label="t('common.close')"
        @click="emit('close')"
      >
        <X :size="15" />
      </button>
      <EnvironmentsView />
    </section>
  </div>
</template>
