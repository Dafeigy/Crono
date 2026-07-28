<script setup lang="ts">
import { FileJson2, Folder, Search, X } from "lucide-vue-next";
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { useModelsStore } from "../../stores/models";

const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const router = useRouter();
const models = useModelsStore();
const query = ref("");
const searchInput = ref<HTMLInputElement>();

const results = computed(() => {
  const value = query.value.trim().toLocaleLowerCase();
  const requests = models.httpRequests
    .filter(
      ({ workspaceId, name, method }) =>
        workspaceId === models.activeWorkspaceId &&
        (!value ||
          name.toLocaleLowerCase().includes(value) ||
          method.toLocaleLowerCase().includes(value)),
    )
    .map((request) => ({
      id: request.id,
      label: request.name,
      detail: request.method,
      icon: FileJson2,
      run: () => router.push({ path: "/", query: { request: request.id } }),
    }));
  const folders = models.folders
    .filter(
      ({ workspaceId, name }) =>
        workspaceId === models.activeWorkspaceId &&
        (!value || name.toLocaleLowerCase().includes(value)),
    )
    .map((folder) => ({
      id: folder.id,
      label: folder.name,
      detail: t("workspace.folder"),
      icon: Folder,
      run: () => router.push("/"),
    }));
  return [...requests, ...folders].slice(0, 12);
});

async function run(command: (typeof results.value)[number]) {
  await command.run();
  emit("close");
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
  if (
    event.key === "Enter" &&
    event.target instanceof HTMLInputElement &&
    results.value[0]
  ) {
    void run(results.value[0]);
  }
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown);
  void nextTick(() => searchInput.value?.focus());
});
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div class="app-dialog-backdrop command-backdrop" @pointerdown.self="emit('close')">
    <section
      class="command-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('app.search')"
    >
      <div class="command-search-field" role="search">
        <Search :size="16" aria-hidden="true" />
        <input
          ref="searchInput"
          v-model="query"
          :aria-label="t('app.search')"
          :placeholder="t('command.placeholder')"
          autocomplete="off"
          spellcheck="false"
        />
        <button
          type="button"
          :aria-label="t('common.close')"
          @click="emit('close')"
        >
          <X :size="14" />
        </button>
      </div>
      <div class="command-results">
        <button
          v-for="command in results"
          :key="command.id"
          type="button"
          @click="run(command)"
        >
          <component :is="command.icon" :size="15" />
          <span>{{ command.label }}</span>
          <small>{{ command.detail }}</small>
        </button>
        <p v-if="!results.length">{{ t("command.noResults") }}</p>
      </div>
    </section>
  </div>
</template>
