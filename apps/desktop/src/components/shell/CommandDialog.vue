<script setup lang="ts">
import type { Environment, HttpRequest } from "@crono/client-core";
import {
  Braces,
  Copy,
  FileJson2,
  Folder,
  FolderKanban,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-vue-next";
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type Component,
} from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import {
  environmentVariableMap,
  requestToCurl,
} from "../../curl";
import { orderRequestsForNavigation } from "../../requestNavigation";
import { useModelsStore } from "../../stores/models";

type CommandGroup = "actions" | "requests" | "folders" | "workspaces";

interface CommandResult {
  id: string;
  label: string;
  detail: string;
  group: CommandGroup;
  icon: Component;
  danger?: boolean;
  close?: boolean;
  run: () => void | Promise<void>;
}

const emit = defineEmits<{
  close: [];
  createWorkspace: [];
  openEnvironments: [];
}>();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const models = useModelsStore();
const query = ref("");
const searchInput = ref<HTMLInputElement>();
const selectedIndex = ref(0);
const pendingDelete = ref<HttpRequest>();
const deleting = ref(false);
const error = ref("");

const activeRequest = computed(
  () =>
    models.httpRequests.find(
      ({ id, workspaceId }) =>
        id === route.query.request &&
        workspaceId === models.activeWorkspaceId,
    ) ?? models.currentRequest,
);

function createEnvironment() {
  const workspaceId = models.activeWorkspaceId;
  if (!workspaceId) return;
  const timestamp = Math.floor(Date.now() / 1000);
  const environment: Environment = {
    id: `env_${crypto.randomUUID().replaceAll("-", "")}`,
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
  void models.queueModel({ model: "environment", data: environment });
  emit("openEnvironments");
}

const commands = computed<CommandResult[]>(() => {
  const request = activeRequest.value;
  const actions: CommandResult[] = [
    {
      id: "action-new-request",
      label: t("workspace.newRequest"),
      detail: t("command.action"),
      group: "actions",
      icon: Plus,
      run: () =>
        window.dispatchEvent(new CustomEvent("crono:create-request")),
    },
    {
      id: "action-new-workspace",
      label: t("workspace.newWorkspace"),
      detail: t("command.action"),
      group: "actions",
      icon: FolderKanban,
      run: () => emit("createWorkspace"),
    },
    {
      id: "action-create-environment",
      label: t("command.createEnvironment"),
      detail: t("command.action"),
      group: "actions",
      icon: Braces,
      run: createEnvironment,
    },
  ];

  if (request) {
    actions.push(
      {
        id: "action-copy-curl",
        label: t("command.copyAsCurl"),
        detail: request.name,
        group: "actions",
        icon: Copy,
        run: async () => {
          const variables = environmentVariableMap(
            models.environments,
            models.activeEnvironmentId,
          );
          await navigator.clipboard.writeText(
            requestToCurl(request, variables),
          );
        },
      },
      {
        id: "action-delete-request",
        label: t("command.deleteRequest"),
        detail: request.name,
        group: "actions",
        icon: Trash2,
        danger: true,
        close: false,
        run: () => {
          pendingDelete.value = request;
        },
      },
    );
  }

  const workspaceFolders = models.folders.filter(
    ({ workspaceId }) => workspaceId === models.activeWorkspaceId,
  );
  const requests: CommandResult[] = orderRequestsForNavigation(
    models.httpRequests.filter(
      ({ workspaceId }) => workspaceId === models.activeWorkspaceId,
    ),
    workspaceFolders,
  )
    .map((item) => ({
      id: `request-${item.id}`,
      label: item.name,
      detail: item.method,
      group: "requests",
      icon: FileJson2,
      run: async () => {
        models.selectRequest(item.id);
        await router.push({ path: "/", query: { request: item.id } });
      },
    }));

  const folders: CommandResult[] = [...workspaceFolders]
    .sort((left, right) => left.sortPriority - right.sortPriority)
    .map((folder) => ({
      id: `folder-${folder.id}`,
      label: folder.name,
      detail: t("workspace.folder"),
      group: "folders",
      icon: Folder,
      run: async () => {
        await router.push("/");
      },
    }));

  const workspaces: CommandResult[] = [...models.workspaces]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((workspace) => ({
      id: `workspace-${workspace.id}`,
      label: workspace.name,
      detail:
        workspace.id === models.activeWorkspaceId
          ? t("command.currentWorkspace")
          : t("command.switchWorkspace"),
      group: "workspaces",
      icon: FolderKanban,
      run: async () => {
        await models.switchWorkspace(workspace.id);
        await router.push("/");
      },
    }));

  return [...actions, ...requests, ...folders, ...workspaces];
});

const results = computed(() => {
  const value = query.value.trim().toLocaleLowerCase();
  return commands.value
    .filter(
      ({ label, detail }) =>
        !value ||
        label.toLocaleLowerCase().includes(value) ||
        detail.toLocaleLowerCase().includes(value),
    )
    .slice(0, 40);
});

function groupLabel(group: CommandGroup) {
  return t(`command.groups.${group}`);
}

async function run(command: CommandResult) {
  error.value = "";
  try {
    await command.run();
    if (command.close !== false) emit("close");
  } catch {
    error.value = t("command.actionFailed");
  }
}

async function confirmDelete() {
  const request = pendingDelete.value;
  if (!request || deleting.value) return;
  deleting.value = true;
  error.value = "";
  try {
    await models.deleteModel(
      "http_request",
      request.id,
      request.workspaceId,
    );
    if (route.query.request === request.id) await router.push("/");
    emit("close");
  } catch {
    error.value = t("command.actionFailed");
  } finally {
    deleting.value = false;
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    if (pendingDelete.value) {
      pendingDelete.value = undefined;
      void nextTick(() => searchInput.value?.focus());
    } else {
      emit("close");
    }
    return;
  }
  if (pendingDelete.value) return;
  const key = event.key.toLocaleLowerCase();
  const vimDown =
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    key === "j";
  const vimUp =
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    key === "k";
  if (
    event.key === "ArrowDown" ||
    event.key === "ArrowUp" ||
    vimDown ||
    vimUp
  ) {
    if (!results.value.length) return;
    event.preventDefault();
    const offset = event.key === "ArrowDown" || vimDown ? 1 : -1;
    selectedIndex.value =
      (selectedIndex.value + offset + results.value.length) %
      results.value.length;
    void nextTick(() =>
      document
        .querySelector<HTMLElement>(
          `[data-command-index="${selectedIndex.value}"]`,
        )
        ?.scrollIntoView?.({ block: "nearest" }),
    );
  } else if (event.key === "Enter") {
    const command = results.value[selectedIndex.value];
    if (!command) return;
    event.preventDefault();
    void run(command);
  }
}

watch(query, () => {
  selectedIndex.value = 0;
  error.value = "";
});
watch(results, () => {
  if (selectedIndex.value >= results.value.length) selectedIndex.value = 0;
});

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
      <template v-if="pendingDelete">
        <div class="command-confirmation">
          <span class="command-confirmation-icon" aria-hidden="true">
            <Trash2 :size="18" />
          </span>
          <div>
            <h2>{{ t("workspace.deleteRequestTitle") }}</h2>
            <p>
              {{
                t("workspace.deleteRequestDescription", {
                  name: pendingDelete.name,
                })
              }}
            </p>
          </div>
        </div>
        <p v-if="error" class="command-error" role="alert">{{ error }}</p>
        <div class="command-confirmation-actions">
          <button
            type="button"
            :disabled="deleting"
            @click="pendingDelete = undefined"
          >
            {{ t("common.cancel") }}
          </button>
          <button
            class="is-danger"
            type="button"
            :disabled="deleting"
            @click="confirmDelete"
          >
            {{ deleting ? t("request.deleting") : t("common.delete") }}
          </button>
        </div>
      </template>

      <template v-else>
        <div class="command-search-field" role="search">
          <Search :size="16" aria-hidden="true" />
          <input
            ref="searchInput"
            v-model="query"
            :aria-label="t('app.search')"
            :placeholder="t('command.placeholder')"
            aria-controls="command-results"
            :aria-activedescendant="`command-result-${selectedIndex}`"
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
        <p v-if="error" class="command-error" role="alert">{{ error }}</p>
        <div id="command-results" class="command-results">
          <template
            v-for="(command, index) in results"
            :key="command.id"
          >
            <h2
              v-if="index === 0 || results[index - 1]?.group !== command.group"
              class="command-group-label"
            >
              {{ groupLabel(command.group) }}
            </h2>
            <button
              :id="`command-result-${index}`"
              type="button"
              :class="{
                'is-selected': selectedIndex === index,
                'is-danger': command.danger,
              }"
              :data-command-index="index"
              @pointerenter="selectedIndex = index"
              @click="run(command)"
            >
              <component :is="command.icon" :size="15" />
              <span>{{ command.label }}</span>
              <small>{{ command.detail }}</small>
            </button>
          </template>
          <p v-if="!results.length">{{ t("command.noResults") }}</p>
        </div>
      </template>
    </section>
  </div>
</template>
