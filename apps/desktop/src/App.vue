<script setup lang="ts">
import { CircleAlert, CircleCheck, X } from "lucide-vue-next";
import { onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import CollectionSidebar from "./components/shell/CollectionSidebar.vue";
import TitleBar from "./components/shell/TitleBar.vue";
import { useHttpStore } from "./stores/http";
import { useModelsStore } from "./stores/models";
import { useUiStore } from "./stores/ui";

const http = useHttpStore();
const models = useModelsStore();
const ui = useUiStore();
const { t } = useI18n();

onBeforeUnmount(() => {
  http.dispose();
  models.dispose();
});
</script>

<template>
  <div class="app-root">
    <TitleBar />
    <div class="app-body" :class="{ 'sidebar-collapsed': !ui.sidebarOpen }">
      <CollectionSidebar
        :class="{ 'is-collapsed': !ui.sidebarOpen }"
        :inert="!ui.sidebarOpen"
        :aria-hidden="!ui.sidebarOpen"
      />
      <main class="app-content">
        <RouterView v-slot="{ Component, route }">
          <Transition name="route-page" mode="out-in">
            <component :is="Component" :key="String(route.name)" />
          </Transition>
        </RouterView>
      </main>
    </div>
    <Transition name="app-toast">
      <div
        v-if="ui.toast"
        :key="ui.toast.id"
        class="app-toast"
        :class="`is-${ui.toast.kind}`"
        :role="ui.toast.kind === 'error' ? 'alert' : 'status'"
        :aria-live="ui.toast.kind === 'error' ? 'assertive' : 'polite'"
      >
        <CircleCheck
          v-if="ui.toast.kind === 'success'"
          :size="18"
          aria-hidden="true"
        />
        <CircleAlert v-else :size="18" aria-hidden="true" />
        <span>{{ ui.toast.message }}</span>
        <button
          type="button"
          :aria-label="t('common.close')"
          @click="ui.dismissToast"
        >
          <X :size="14" aria-hidden="true" />
        </button>
      </div>
    </Transition>
  </div>
</template>
