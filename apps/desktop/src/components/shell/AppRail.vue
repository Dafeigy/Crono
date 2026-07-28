<script setup lang="ts">
import { Boxes, Clock3, FlaskConical, Settings2 } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

const { t } = useI18n();
const route = useRoute();

const items = [
  { to: "/", icon: Boxes, label: "app.collections" },
  { to: "/environments", icon: FlaskConical, label: "app.environments" },
  { to: "/history", icon: Clock3, label: "app.history" },
];
</script>

<template>
  <nav class="app-rail" :aria-label="t('app.name')">
    <div class="rail-main">
      <RouterLink
        v-for="item in items"
        :key="item.label"
        :to="item.to"
        class="rail-link"
        exact-active-class="rail-link-active"
        :aria-label="t(item.label)"
        :title="t(item.label)"
      >
        <component :is="item.icon" :size="18" stroke-width="1.8" />
      </RouterLink>
    </div>
    <RouterLink
      :to="
        route.name === 'settings'
          ? route.fullPath
          : { path: '/settings', query: { from: route.fullPath } }
      "
      class="rail-link"
      exact-active-class="rail-link-active"
      :aria-label="t('app.settings')"
      :title="t('app.settings')"
    >
      <Settings2 :size="18" stroke-width="1.8" />
    </RouterLink>
  </nav>
</template>
