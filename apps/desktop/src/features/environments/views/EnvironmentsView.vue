<script setup lang="ts">
import type { Environment, KeyValue } from "@crono/client-core";
import { Button } from "@crono/ui";
import {
  Braces,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  LockKeyhole,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useModelsStore } from "../../../stores/models";
import { useUiStore } from "../../../stores/ui";

const { t } = useI18n();
const models = useModelsStore();
const ui = useUiStore();
const filter = ref("");
const pageElement = ref<HTMLElement>();
const draft = ref<Environment>();
const deleteArmed = ref(false);
const showValues = ref(false);
const expandedEnvironmentIds = ref(new Set<string>());
const newVariableName = ref("");
const newVariableValue = ref("");
let loading = false;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let resizingList = false;
const environmentPageStyle = computed(() => ({
  "--environment-list-width": `${ui.environmentListWidth}px`,
}));

const allWorkspaceEnvironments = computed(() =>
  models.environments
    .filter(({ workspaceId }) => workspaceId === models.activeWorkspaceId)
    .sort((left, right) => left.sortPriority - right.sortPriority),
);
const workspaceEnvironments = computed(() =>
  allWorkspaceEnvironments.value.filter(({ name }) =>
    name.toLocaleLowerCase().includes(filter.value.toLocaleLowerCase()),
  ),
);
const selectedEnvironment = computed(
  () =>
    allWorkspaceEnvironments.value.find(
      ({ id }) => id === models.activeEnvironmentId,
    ) ?? allWorkspaceEnvironments.value[0],
);
const availableParents = computed(() =>
  allWorkspaceEnvironments.value.filter(canUseAsParent),
);

watch(
  selectedEnvironment,
  (environment) => {
    loading = true;
    draft.value = environment
      ? (JSON.parse(JSON.stringify(environment)) as Environment)
      : undefined;
    if (environment) {
      models.activeEnvironmentId = environment.id;
      expandedEnvironmentIds.value.add(environment.id);
    }
    newVariableName.value = "";
    newVariableValue.value = "";
    deleteArmed.value = false;
    queueMicrotask(() => {
      loading = false;
    });
  },
  { immediate: true },
);

watch(
  draft,
  () => {
    if (loading || !draft.value) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistDraft, 250);
  },
  { deep: true },
);

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function persistDraft() {
  clearTimeout(persistTimer);
  persistTimer = undefined;
  if (!draft.value) return Promise.resolve();
  return models.queueModel({
    model: "environment",
    data: {
      ...JSON.parse(JSON.stringify(draft.value)),
      updatedAt: Math.floor(Date.now() / 1000),
    } as Environment,
  });
}

function createEnvironment() {
  const workspaceId = models.activeWorkspaceId;
  if (!workspaceId) return;
  const timestamp = Math.floor(Date.now() / 1000);
  const environment: Environment = {
    id: newId("env"),
    workspaceId,
    parentId: null,
    name: t("environment.untitled"),
    color: "#fb5c8b",
    variables: [],
    sortPriority: Date.now(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  models.activeEnvironmentId = environment.id;
  void models
    .queueModel({ model: "environment", data: environment })
    .catch(() => undefined);
}

function appendVariable() {
  const name = newVariableName.value.trim();
  if (!draft.value || !name) return;
  const variable: KeyValue = {
    id: newId("var"),
    enabled: true,
    name,
    value: newVariableValue.value,
  };
  draft.value.variables.push(variable);
  newVariableName.value = "";
  newVariableValue.value = "";
}

function handleNewVariableKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  appendVariable();
}

function removeVariable(id: string) {
  if (!draft.value) return;
  draft.value.variables = draft.value.variables.filter(
    (variable) => variable.id !== id,
  );
}

function canUseAsParent(candidate: Environment) {
  if (!draft.value || candidate.id === draft.value.id) return false;
  let parentId = candidate.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    if (parentId === draft.value.id) return false;
    visited.add(parentId);
    parentId =
      models.environments.find(({ id }) => id === parentId)?.parentId ?? null;
  }
  return true;
}

function toggleEnvironmentExpanded(id: string) {
  const next = new Set(expandedEnvironmentIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedEnvironmentIds.value = next;
}

async function deleteEnvironment() {
  if (!draft.value) return;
  await models.deleteModel(
    "environment",
    draft.value.id,
    draft.value.workspaceId,
  );
  draft.value = undefined;
  deleteArmed.value = false;
}

function onListPointerMove(event: PointerEvent) {
  if (!resizingList || !pageElement.value) return;
  const bounds = pageElement.value.getBoundingClientRect();
  ui.setEnvironmentListWidth(event.clientX - bounds.left);
}

function stopListResize() {
  resizingList = false;
  document.body.classList.remove("is-resizing-environment");
  window.removeEventListener("pointermove", onListPointerMove);
  window.removeEventListener("pointerup", stopListResize);
}

function startListResize(event: PointerEvent) {
  resizingList = true;
  document.body.classList.add("is-resizing-environment");
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  window.addEventListener("pointermove", onListPointerMove);
  window.addEventListener("pointerup", stopListResize);
}

function onListKeydown(event: KeyboardEvent) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  ui.setEnvironmentListWidth(
    ui.environmentListWidth + (event.key === "ArrowLeft" ? -10 : 10),
  );
}

onBeforeUnmount(() => {
  void persistDraft();
  stopListResize();
});
</script>

<template>
  <section
    ref="pageElement"
    class="environment-page environment-page-refined"
    :style="environmentPageStyle"
  >
    <aside class="environment-list">
      <header class="environment-list-header">
        <div>
          <h1>{{ t("environment.title") }}</h1>
          <p>{{ t("environment.description") }}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          :aria-label="t('environment.new')"
          :title="t('environment.new')"
          @click="createEnvironment"
        >
          <Plus :size="15" />
        </Button>
      </header>

      <label class="environment-search">
        <Search :size="14" />
        <span class="sr-only">{{ t("environment.filter") }}</span>
        <input v-model="filter" :placeholder="t('environment.filter')" />
      </label>

      <div class="environment-tree-heading">
        <ChevronDown :size="13" />
        <span>{{ t("environment.globalVariables") }}</span>
        <button
          type="button"
          :aria-label="t('environment.new')"
          :title="t('environment.new')"
          @click="createEnvironment"
        >
          <Plus :size="13" />
        </button>
      </div>

      <div class="environment-items">
        <div
          v-for="environment in workspaceEnvironments"
          :key="environment.id"
          class="environment-tree-item"
        >
          <div
            class="environment-tree-select"
            :class="{ 'is-active': environment.id === selectedEnvironment?.id }"
          >
            <button
              type="button"
              class="environment-tree-main"
              @click="models.activeEnvironmentId = environment.id"
            >
              <span
                class="environment-color"
                :style="{ backgroundColor: environment.color ?? undefined }"
              />
              <span>{{ environment.name }}</span>
            </button>
            <small>{{ environment.variables.length }}</small>
            <button
              type="button"
              class="environment-tree-expand"
              :class="{ 'is-expanded': expandedEnvironmentIds.has(environment.id) }"
              :aria-label="t('environment.toggleVariables')"
              @click.stop="toggleEnvironmentExpanded(environment.id)"
            >
              <ChevronDown :size="12" />
            </button>
          </div>
          <div
            v-if="
              expandedEnvironmentIds.has(environment.id) &&
              environment.variables.length
            "
            class="environment-tree-variables"
          >
            <span
              v-for="variable in environment.variables.filter(
                (item) => item.enabled && item.name,
              )"
              :key="variable.id"
            >
              {{ variable.name }}
            </span>
          </div>
        </div>
      </div>
    </aside>

    <div
      class="environment-resize-handle"
      role="separator"
      aria-orientation="vertical"
      :aria-valuenow="Math.round(ui.environmentListWidth)"
      aria-valuemin="190"
      aria-valuemax="380"
      tabindex="0"
      @pointerdown="startListResize"
      @keydown="onListKeydown"
    />

    <div v-if="draft" class="environment-editor">
      <header class="environment-editor-toolbar">
        <label
          class="environment-heading-color"
          :title="t('environment.color')"
        >
          <span
            :style="{ backgroundColor: draft.color ?? '#fb5c8b' }"
          />
          <input
            v-model="draft.color"
            type="color"
            :aria-label="t('environment.color')"
          />
        </label>
        <input
          v-model="draft.name"
          class="environment-name-input"
          :aria-label="t('common.name')"
        />
        <button
          type="button"
          class="environment-value-visibility"
          :aria-pressed="showValues"
          @click="showValues = !showValues"
        >
          <Eye v-if="showValues" :size="13" />
          <EyeOff v-else :size="13" />
          {{
            t(
              showValues
                ? "environment.hideValues"
                : "environment.showValues",
            )
          }}
        </button>
        <span class="environment-private-badge">
          <LockKeyhole :size="12" />
          {{ t("environment.private") }}
        </span>
        <div class="environment-delete">
          <Button
            v-if="!deleteArmed"
            variant="ghost"
            size="icon"
            :title="t('environment.delete')"
            :aria-label="t('environment.delete')"
            @click="deleteArmed = true"
          >
            <Trash2 :size="15" />
          </Button>
          <template v-else>
            <Button variant="destructive" size="sm" @click="deleteEnvironment">
              <Check :size="13" />{{ t("common.confirm") }}
            </Button>
            <Button variant="outline" size="sm" @click="deleteArmed = false">
              {{ t("common.cancel") }}
            </Button>
          </template>
        </div>
      </header>

      <div class="environment-context-bar">
        <div>
          <span>{{ t("environment.parent") }}</span>
          <select v-model="draft.parentId">
            <option :value="null">{{ t("environment.noParent") }}</option>
            <option
              v-for="environment in availableParents"
              :key="environment.id"
              :value="environment.id"
            >
              {{ environment.name }}
            </option>
          </select>
        </div>
        <p>
          {{ t("environment.usageHint") }}
          <code v-text="'{{variable}}'" />
        </p>
      </div>

      <div class="environment-variable-table">
        <div class="environment-variable-labels">
          <span>{{ t("request.enabled") }}</span>
          <span>{{ t("request.key") }}</span>
          <span>{{ t("request.value") }}</span>
          <span />
        </div>

        <div
          v-for="variable in draft.variables"
          :key="variable.id"
          class="environment-variable-row"
        >
          <label class="environment-variable-enabled">
            <input
              v-model="variable.enabled"
              type="checkbox"
              :aria-label="t('request.enabled')"
            />
            <Check v-if="variable.enabled" :size="11" />
          </label>
          <input
            v-model="variable.name"
            :placeholder="t('environment.variableName')"
            autocomplete="off"
            spellcheck="false"
          />
          <div class="environment-variable-value">
            <input
              v-model="variable.value"
              :type="showValues ? 'text' : 'password'"
              :placeholder="t('environment.variableValue')"
              autocomplete="new-password"
              spellcheck="false"
            />
            <Eye v-if="showValues" :size="13" />
            <EyeOff v-else :size="13" />
          </div>
          <button
            type="button"
            :aria-label="t('request.removeField')"
            :title="t('request.removeField')"
            @click="removeVariable(variable.id)"
          >
            <X :size="13" />
          </button>
        </div>

        <div class="environment-variable-row environment-variable-new">
          <span />
          <input
            v-model="newVariableName"
            :placeholder="t('environment.variableName')"
            autocomplete="off"
            spellcheck="false"
            @keydown="handleNewVariableKeydown"
          />
          <div class="environment-variable-value">
            <input
              v-model="newVariableValue"
              :type="showValues ? 'text' : 'password'"
              :placeholder="t('environment.variableValue')"
              autocomplete="new-password"
              spellcheck="false"
              @keydown="handleNewVariableKeydown"
            />
            <Eye v-if="showValues" :size="13" />
            <EyeOff v-else :size="13" />
          </div>
          <button
            type="button"
            :disabled="!newVariableName.trim()"
            :aria-label="t('environment.addVariable')"
            :title="t('environment.addVariable')"
            @click="appendVariable"
          >
            <Plus :size="13" />
          </button>
        </div>
      </div>

      <button
        type="button"
        class="environment-bulk-edit"
        disabled
        :title="t('environment.bulkEditPlanned')"
        :aria-label="t('environment.bulkEditPlanned')"
      >
        <Braces :size="15" />
        <span>{{ t("environment.bulkEdit") }}</span>
      </button>
    </div>

    <div v-else class="environment-editor-empty">
      <Braces :size="28" />
      <h2>{{ t("environment.emptyTitle") }}</h2>
      <p>{{ t("environment.emptyDescription") }}</p>
      <Button @click="createEnvironment">
        <Plus :size="15" />{{ t("environment.new") }}
      </Button>
    </div>
  </section>
</template>
