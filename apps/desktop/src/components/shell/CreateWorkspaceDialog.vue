<script setup lang="ts">
import type { Workspace } from "@crono/client-core";
import { Button, Input } from "@crono/ui";
import { Plus, X } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { useModelsStore } from "../../stores/models";

const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const router = useRouter();
const models = useModelsStore();
const name = ref("");
const submitting = ref(false);
const error = ref("");
const canSubmit = computed(() => name.value.trim().length > 0 && !submitting.value);

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

async function createWorkspace() {
  const workspaceName = name.value.trim();
  if (!workspaceName || submitting.value) return;

  submitting.value = true;
  error.value = "";
  const timestamp = Math.floor(Date.now() / 1000);
  const workspace: Workspace = {
    id: newId("wk"),
    name: workspaceName,
    description: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  try {
    await models.queueModel({ model: "workspace", data: workspace });
    await models.switchWorkspace(workspace.id);
    await router.push("/");
    emit("close");
  } catch {
    error.value = t("workspace.createFailed");
  } finally {
    submitting.value = false;
  }
}

function requestClose() {
  if (!submitting.value) emit("close");
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") requestClose();
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div class="app-dialog-backdrop" @pointerdown.self="requestClose">
    <section
      class="app-dialog workspace-create-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-workspace-title"
    >
      <header class="workspace-dialog-header">
        <div class="workspace-dialog-heading">
          <span class="workspace-dialog-icon" aria-hidden="true">
            <Plus :size="16" />
          </span>
          <div>
            <h2 id="create-workspace-title">
              {{ t("workspace.createWorkspace") }}
            </h2>
            <p>{{ t("workspace.createDescription") }}</p>
          </div>
        </div>
        <button
          class="dialog-close-button workspace-dialog-close"
          type="button"
          :disabled="submitting"
          :aria-label="t('common.close')"
          @click="requestClose"
        >
          <X :size="15" />
        </button>
      </header>

      <form class="workspace-create-form" @submit.prevent="createWorkspace">
        <label for="new-workspace-name">
          <span>{{ t("settings.workspaceName") }}</span>
          <Input
            id="new-workspace-name"
            v-model="name"
            autofocus
            required
            maxlength="120"
            autocomplete="off"
            :placeholder="t('workspace.namePlaceholder')"
          />
        </label>
        <p v-if="error" class="workspace-dialog-error" role="alert">
          {{ error }}
        </p>
        <div class="workspace-dialog-actions">
          <Button
            type="button"
            variant="outline"
            :disabled="submitting"
            @click="requestClose"
          >
            {{ t("common.cancel") }}
          </Button>
          <Button type="submit" :disabled="!canSubmit">
            {{ submitting ? t("common.creating") : t("workspace.createWorkspace") }}
          </Button>
        </div>
      </form>
    </section>
  </div>
</template>
