<script setup lang="ts">
import { Badge } from "@crono/ui";
import { Database, FlaskConical } from "lucide-vue-next";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { useModelsStore } from "../../../stores/models";

const route = useRoute();
const { t } = useI18n();
const models = useModelsStore();
const isEnvironments = computed(() => route.name === "environments");
const title = computed(() => t(String(route.meta.titleKey)));
const description = computed(() => t(String(route.meta.descriptionKey)));
</script>

<template>
  <section class="phase-two-page">
    <div class="phase-two-card">
      <div class="phase-two-icon">
        <FlaskConical v-if="isEnvironments" :size="24" />
        <Database v-else :size="24" />
      </div>
      <Badge tone="info">Phase 2</Badge>
      <h1>{{ title }}</h1>
      <p>{{ description }}</p>
      <small>
        {{
          t("workspace.persistedModels", {
            count: isEnvironments ? models.environments.length : models.sequence,
          })
        }}
      </small>
    </div>
  </section>
</template>
