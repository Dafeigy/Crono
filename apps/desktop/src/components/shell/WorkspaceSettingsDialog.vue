<script setup lang="ts">
import type { Workspace } from "@crono/client-core";
import { Button, Input } from "@crono/ui";
import { BriefcaseBusiness, Check, Copy, Trash2, X } from "lucide-vue-next";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { useModelsStore } from "../../stores/models";

const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const router = useRouter();
const models = useModelsStore();
const workspaceDraft = ref<Workspace>();
const deleteArmed = ref(false);
const deleteConfirmation = ref("");
const saving = ref(false);
const deleting = ref(false);
const copied = ref(false);
const error = ref("");
let loadingWorkspace = false;
let persistTimer: ReturnType<typeof setTimeout> | undefined;

const isLastWorkspace = computed(() => models.workspaces.length <= 1);
const canDelete = computed(
  () =>
    !isLastWorkspace.value &&
    deleteConfirmation.value === workspaceDraft.value?.name &&
    !deleting.value,
);

watch(
  () => models.currentWorkspace,
  (workspace) => {
    loadingWorkspace = true;
    workspaceDraft.value = workspace
      ? (JSON.parse(JSON.stringify(workspace)) as Workspace)
      : undefined;
    deleteArmed.value = false;
    deleteConfirmation.value = "";
    nextTick(() => {
      loadingWorkspace = false;
    });
  },
  { immediate: true },
);

watch(
  workspaceDraft,
  () => {
    if (loadingWorkspace || !workspaceDraft.value) return;
    error.value = "";
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => void persistWorkspace(), 300);
  },
  { deep: true },
);

async function persistWorkspace() {
  clearTimeout(persistTimer);
  persistTimer = undefined;
  const draft = workspaceDraft.value;
  const name = draft?.name.trim();
  if (!draft || !name || deleting.value) return;

  saving.value = true;
  try {
    await models.queueModel({
      model: "workspace",
      data: {
        ...draft,
        name,
        updatedAt: Math.floor(Date.now() / 1000),
      },
    });
  } catch {
    error.value = t("workspace.saveFailed");
  } finally {
    saving.value = false;
  }
}

async function requestClose() {
  if (deleting.value) return;
  await persistWorkspace();
  emit("close");
}

async function deleteWorkspace() {
  const workspace = workspaceDraft.value;
  if (!workspace || !canDelete.value) return;

  clearTimeout(persistTimer);
  deleting.value = true;
  error.value = "";
  try {
    await models.deleteModel("workspace", workspace.id, workspace.id);
    const nextWorkspace = models.workspaces[0];
    if (nextWorkspace) await models.switchWorkspace(nextWorkspace.id);
    await router.replace("/");
    emit("close");
  } catch {
    error.value = t("workspace.deleteFailed");
    deleting.value = false;
  }
}

async function copyWorkspaceId() {
  const id = workspaceDraft.value?.id;
  if (!id) return;
  try {
    await navigator.clipboard.writeText(id);
    copied.value = true;
    window.setTimeout(() => {
      copied.value = false;
    }, 1400);
  } catch {
    error.value = t("workspace.copyIdFailed");
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    if (deleteArmed.value) {
      deleteArmed.value = false;
      deleteConfirmation.value = "";
    } else {
      void requestClose();
    }
  }
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
onBeforeUnmount(() => clearTimeout(persistTimer));
</script>

<template>
  <div class="app-dialog-backdrop" @pointerdown.self="requestClose">
    <section
      class="app-dialog workspace-settings-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-settings-title"
    >
      <header class="workspace-dialog-header">
        <div class="workspace-dialog-heading">
          <span class="workspace-dialog-icon" aria-hidden="true">
            <BriefcaseBusiness :size="16" />
          </span>
          <div>
            <h2 id="workspace-settings-title">{{ t("settings.workspace") }}</h2>
            <p>{{ t("settings.workspaceDescription") }}</p>
          </div>
        </div>
        <button
          class="dialog-close-button workspace-dialog-close"
          type="button"
          :disabled="deleting"
          :aria-label="t('common.close')"
          @click="requestClose"
        >
          <X :size="15" />
        </button>
      </header>

      <div v-if="workspaceDraft" class="workspace-dialog-content">
        <label class="workspace-dialog-field" for="workspace-name">
          <span>{{ t("settings.workspaceName") }}</span>
          <Input
            id="workspace-name"
            v-model="workspaceDraft.name"
            maxlength="120"
            :disabled="deleting"
            @blur="persistWorkspace"
          />
        </label>

        <label class="workspace-dialog-field workspace-description-field" for="workspace-description">
          <span>{{ t("settings.workspaceSummary") }}</span>
          <textarea
            id="workspace-description"
            v-model="workspaceDraft.description"
            rows="8"
            maxlength="4000"
            :disabled="deleting"
            :placeholder="t('workspace.descriptionPlaceholder')"
            @blur="persistWorkspace"
          />
        </label>

        <p v-if="error" class="workspace-dialog-error" role="alert">
          {{ error }}
        </p>

        <footer class="workspace-settings-footer">
          <div class="workspace-delete-area">
            <Button
              v-if="!deleteArmed"
              variant="outline"
              size="sm"
              :disabled="isLastWorkspace || deleting"
              @click="deleteArmed = true"
            >
              <Trash2 :size="14" />
              {{ t("settings.deleteWorkspace") }}
            </Button>
            <div v-else class="workspace-delete-confirmation">
              <p>{{ t("workspace.typeNameToDelete", { name: workspaceDraft.name }) }}</p>
              <div>
                <Input
                  v-model="deleteConfirmation"
                  :aria-label="t('workspace.deleteConfirmation')"
                  autocomplete="off"
                  :disabled="deleting"
                  @keydown.enter.prevent="deleteWorkspace"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  :disabled="!canDelete"
                  @click="deleteWorkspace"
                >
                  <Trash2 :size="13" />
                  {{ deleting ? t("common.deleting") : t("common.delete") }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="deleting"
                  @click="
                    deleteArmed = false;
                    deleteConfirmation = '';
                  "
                >
                  {{ t("common.cancel") }}
                </Button>
              </div>
            </div>
            <small v-if="isLastWorkspace">{{ t("settings.lastWorkspace") }}</small>
            <small v-else-if="!deleteArmed">{{ t("settings.deleteWorkspaceHint") }}</small>
          </div>

          <button
            class="workspace-id-button"
            type="button"
            :title="t('workspace.copyId')"
            @click="copyWorkspaceId"
          >
            <code>{{ workspaceDraft.id }}</code>
            <Check v-if="copied" :size="13" aria-hidden="true" />
            <Copy v-else :size="13" aria-hidden="true" />
          </button>
        </footer>
      </div>
      <div v-else class="workspace-dialog-empty">
        {{ t("workspace.notFound") }}
      </div>
      <span class="workspace-save-status" aria-live="polite">
        {{ saving ? t("common.saving") : "" }}
      </span>
    </section>
  </div>
</template>
