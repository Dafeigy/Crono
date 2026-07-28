<script setup lang="ts">
import { onBeforeUnmount } from "vue";
import CollectionSidebar from "./components/shell/CollectionSidebar.vue";
import TitleBar from "./components/shell/TitleBar.vue";
import { useHttpStore } from "./stores/http";
import { useModelsStore } from "./stores/models";
import { useUiStore } from "./stores/ui";

const http = useHttpStore();
const models = useModelsStore();
const ui = useUiStore();

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
  </div>
</template>
