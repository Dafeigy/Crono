<script setup lang="ts">
import type { Folder as FolderModel, HttpRequest } from "@crono/client-core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Columns2,
  Cookie,
  FileJson2,
  FolderPlus,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Rows2,
  Search,
  Settings2,
  Square,
  X,
} from "lucide-vue-next";
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
} from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useModelsStore } from "../../stores/models";
import { useUiStore } from "../../stores/ui";
import CommandDialog from "./CommandDialog.vue";
import CreateWorkspaceDialog from "./CreateWorkspaceDialog.vue";
import EnvironmentDialog from "./EnvironmentDialog.vue";
import WorkspaceSettingsDialog from "./WorkspaceSettingsDialog.vue";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const models = useModelsStore();
const ui = useUiStore();
const workspaceRoot = ref<HTMLElement>();
const createMenuRoot = ref<HTMLElement>();
const requestMenuRoot = ref<HTMLElement>();
const requestMenuButton = ref<HTMLButtonElement>();
const createMenuOpen = ref(false);
const workspaceMenuOpen = ref(false);
const requestMenuOpen = ref(false);
const createWorkspaceDialogOpen = ref(false);
const workspaceSettingsDialogOpen = ref(false);
const environmentDialogOpen = ref(false);
const commandDialogOpen = ref(false);
const isTauri = "__TAURI_INTERNALS__" in window;

const selectedRequest = computed(
  () =>
    models.httpRequests.find(({ id }) => id === route.query.request) ??
    models.currentRequest,
);
const workspaceRequests = computed(() =>
  models.httpRequests
    .filter(({ workspaceId }) => workspaceId === models.activeWorkspaceId)
    .sort((left, right) => left.sortPriority - right.sortPriority),
);
const currentTitle = computed(() =>
  route.name === "settings"
    ? t("app.settings")
    : (selectedRequest.value?.name ?? t("request.untitled")),
);

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function openCreateWorkspaceDialog() {
  workspaceMenuOpen.value = false;
  createWorkspaceDialogOpen.value = true;
}

function openWorkspaceSettingsDialog() {
  workspaceMenuOpen.value = false;
  workspaceSettingsDialogOpen.value = true;
}

async function selectWorkspace(id: string) {
  await finishFocusedEdit();
  await models.switchWorkspace(id);
  workspaceMenuOpen.value = false;
  requestMenuOpen.value = false;
  await router.push("/");
}

async function selectRequest(id: string) {
  if (id === selectedRequest.value?.id && route.name === "workspace") {
    requestMenuOpen.value = false;
    requestMenuButton.value?.focus();
    return;
  }
  await finishFocusedEdit();
  models.selectRequest(id);
  requestMenuOpen.value = false;
  await router.push({ path: "/", query: { request: id } });
  requestMenuButton.value?.focus();
}

async function toggleRequestMenu() {
  requestMenuOpen.value = !requestMenuOpen.value;
  if (!requestMenuOpen.value) return;
  await nextTick();
  requestMenuRoot.value
    ?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')
    ?.focus();
}

function onRequestMenuFocusOut() {
  window.setTimeout(() => {
    if (
      requestMenuOpen.value &&
      !requestMenuRoot.value?.contains(document.activeElement)
    ) {
      requestMenuOpen.value = false;
    }
  });
}

async function finishFocusedEdit() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
    await nextTick();
  }
}

async function toggleSidebar() {
  await finishFocusedEdit();
  ui.toggleSidebar();
}

async function createRequest() {
  await finishFocusedEdit();
  const workspaceId = models.activeWorkspaceId;
  if (!workspaceId) return;
  const timestamp = Math.floor(Date.now() / 1000);
  const request: HttpRequest = {
    id: newId("rq"),
    workspaceId,
    folderId: selectedRequest.value?.folderId ?? null,
    name: t("request.untitled"),
    method: "GET",
    url: "",
    parameters: [],
    headers: [],
    body: { type: "none" },
    authentication: { type: "none" },
    timeoutMs: 30_000,
    sortPriority: Date.now(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await models.queueModel({ model: "http_request", data: request });
  await router.push({ path: "/", query: { request: request.id } });
  createMenuOpen.value = false;
  ui.setSidebarOpen(true);
  await nextTick();
  window.dispatchEvent(
    new CustomEvent("crono:rename-model", { detail: { id: request.id } }),
  );
}

async function createFolder() {
  await finishFocusedEdit();
  const workspaceId = models.activeWorkspaceId;
  if (!workspaceId) return;
  const timestamp = Math.floor(Date.now() / 1000);
  const folder: FolderModel = {
    id: newId("fl"),
    workspaceId,
    parentId: null,
    name: t("workspace.untitledFolder"),
    sortPriority: Date.now(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await models.queueModel({ model: "folder", data: folder });
  createMenuOpen.value = false;
  ui.setSidebarOpen(true);
  await nextTick();
  window.dispatchEvent(
    new CustomEvent("crono:rename-model", { detail: { id: folder.id } }),
  );
}

function onDocumentPointerDown(event: PointerEvent) {
  if (
    createMenuOpen.value &&
    !createMenuRoot.value?.contains(event.target as Node)
  ) {
    createMenuOpen.value = false;
  }
  if (
    workspaceMenuOpen.value &&
    !workspaceRoot.value?.contains(event.target as Node)
  ) {
    workspaceMenuOpen.value = false;
  }
  if (
    requestMenuOpen.value &&
    !requestMenuRoot.value?.contains(event.target as Node)
  ) {
    requestMenuOpen.value = false;
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
    event.preventDefault();
    commandDialogOpen.value = true;
  }
  if (event.key === "Escape") {
    createMenuOpen.value = false;
    workspaceMenuOpen.value = false;
    if (requestMenuOpen.value) {
      requestMenuOpen.value = false;
      requestMenuButton.value?.focus();
    }
  }
}

async function minimizeWindow() {
  if (isTauri) await getCurrentWindow().minimize();
}

async function toggleMaximizeWindow() {
  if (isTauri) await getCurrentWindow().toggleMaximize();
}

async function closeWindow() {
  if (isTauri) await getCurrentWindow().close();
}

function onTitlebarDoubleClick(event: MouseEvent) {
  if ((event.target as HTMLElement).closest("button, a, input")) return;
  void toggleMaximizeWindow();
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeydown);
});
onUnmounted(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeydown);
});
</script>

<template>
  <header
    class="titlebar"
    data-tauri-drag-region
    @dblclick="onTitlebarDoubleClick"
  >
    <div class="titlebar-breadcrumbs" data-tauri-drag-region>
      <div class="titlebar-leading-actions">
        <button
          type="button"
          :aria-label="
            t(ui.sidebarOpen ? 'workspace.collapseSidebar' : 'workspace.expandSidebar')
          "
          :title="
            t(ui.sidebarOpen ? 'workspace.collapseSidebar' : 'workspace.expandSidebar')
          "
          @click="toggleSidebar"
        >
          <PanelLeftClose v-if="ui.sidebarOpen" :size="13" />
          <PanelLeftOpen v-else :size="13" />
        </button>
        <div ref="createMenuRoot" class="titlebar-create-root">
          <button
            type="button"
            :aria-label="t('common.create')"
            :title="t('common.create')"
            aria-haspopup="menu"
            :aria-expanded="createMenuOpen"
            @click="createMenuOpen = !createMenuOpen"
          >
            <Plus :size="13" />
          </button>
          <div v-if="createMenuOpen" class="titlebar-create-menu" role="menu">
            <button type="button" role="menuitem" @click="createRequest">
              <FileJson2 :size="14" />
              <span>{{ t("workspace.newRequest") }}</span>
            </button>
            <button type="button" role="menuitem" @click="createFolder">
              <FolderPlus :size="14" />
              <span>{{ t("workspace.newFolder") }}</span>
            </button>
          </div>
        </div>
        <button
          class="is-reserved"
          type="button"
          disabled
          :aria-label="t('app.cookieJar')"
          :title="`${t('app.cookieJar')} · ${t('common.comingSoon')}`"
        >
          <Cookie :size="13" />
        </button>
      </div>

      <div ref="workspaceRoot" class="workspace-menu-root">
        <button
          class="breadcrumb-button workspace-breadcrumb"
          type="button"
          :aria-expanded="workspaceMenuOpen"
          @click="workspaceMenuOpen = !workspaceMenuOpen"
        >
          <span class="workspace-dot" />
          <span>{{ models.currentWorkspace?.name ?? t("workspace.untitled") }}</span>
          <ChevronDown :size="12" />
        </button>
        <div v-if="workspaceMenuOpen" class="workspace-menu">
          <div class="workspace-menu-heading">
            <span>{{ t("workspace.selectWorkspace") }}</span>
          </div>
          <div class="workspace-menu-items">
            <button
              v-for="workspace in models.workspaces"
              :key="workspace.id"
              type="button"
              :class="{ 'is-active': workspace.id === models.activeWorkspaceId }"
              @click="selectWorkspace(workspace.id)"
            >
              <span>{{ workspace.name }}</span>
              <Check
                v-if="workspace.id === models.activeWorkspaceId"
                :size="13"
              />
            </button>
          </div>
          <div class="workspace-menu-footer">
            <button type="button" @click="openCreateWorkspaceDialog">
              <Plus :size="13" />
              {{ t("workspace.newWorkspace") }}
            </button>
            <button type="button" @click="openWorkspaceSettingsDialog">
              <Settings2 :size="13" />
              {{ t("workspace.workspaceSettings") }}
            </button>
          </div>
        </div>
      </div>

      <ChevronRight class="breadcrumb-separator" :size="14" />
      <button
        class="breadcrumb-button environment-breadcrumb"
        type="button"
        @click="environmentDialogOpen = true"
      >
        <span
          v-if="models.currentEnvironment"
          class="environment-color"
          :style="{ backgroundColor: models.currentEnvironment.color ?? undefined }"
        />
        <span>{{
          models.currentEnvironment?.name ?? t("workspace.noEnvironment")
        }}</span>
      </button>
    </div>

    <div
      v-if="route.name === 'workspace' && selectedRequest"
      ref="requestMenuRoot"
      class="request-switcher"
      @focusout="onRequestMenuFocusOut"
    >
      <button
        ref="requestMenuButton"
        class="request-switcher-button"
        type="button"
        aria-haspopup="menu"
        :aria-expanded="requestMenuOpen"
        :aria-label="t('request.selectRequest')"
        @click="toggleRequestMenu"
      >
        <span>{{ currentTitle }}</span>
        <ChevronDown :size="12" aria-hidden="true" />
      </button>
      <div v-if="requestMenuOpen" class="request-switcher-menu" role="menu">
        <div class="request-switcher-heading">
          {{ t("request.selectRequest") }}
        </div>
        <div class="request-switcher-items">
          <button
            v-for="request in workspaceRequests"
            :key="request.id"
            type="button"
            role="menuitemradio"
            :aria-checked="request.id === selectedRequest.id"
            :class="{ 'is-active': request.id === selectedRequest.id }"
            @click="selectRequest(request.id)"
          >
            <span
              class="method-label"
              :class="`method-${request.method.toLowerCase()}`"
            >
              {{ request.method }}
            </span>
            <span class="request-switcher-name">{{ request.name }}</span>
            <Check
              v-if="request.id === selectedRequest.id"
              :size="13"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>
    <div v-else class="current-document-title" data-tauri-drag-region>
      {{ currentTitle }}
    </div>

    <div class="titlebar-actions">
      <button
        type="button"
        :aria-label="t('layout.toggle')"
        :title="t('layout.toggle')"
        @click="ui.toggleSplitLayout"
      >
        <Rows2 v-if="ui.splitLayout === 'horizontal'" :size="14" />
        <Columns2 v-else :size="14" />
      </button>
      <button
        type="button"
        :aria-label="t('app.search')"
        :title="`${t('app.search')} (Ctrl+K)`"
        @click="commandDialogOpen = true"
      >
        <Search :size="14" />
      </button>
      <RouterLink
        class="icon-link"
        to="/settings"
        :aria-label="t('app.settings')"
        :title="t('app.settings')"
      >
        <Settings2 :size="14" />
      </RouterLink>
      <div v-if="isTauri" class="window-controls">
        <button
          type="button"
          :aria-label="t('window.minimize')"
          @click="minimizeWindow"
        >
          <Minus :size="15" />
        </button>
        <button
          type="button"
          :aria-label="t('window.maximize')"
          @click="toggleMaximizeWindow"
        >
          <Square :size="13" />
        </button>
        <button
          class="window-close-button"
          type="button"
          :aria-label="t('window.close')"
          @click="closeWindow"
        >
          <X :size="16" />
        </button>
      </div>
    </div>

    <Teleport to="body">
      <EnvironmentDialog
        v-if="environmentDialogOpen"
        @close="environmentDialogOpen = false"
      />
      <CommandDialog
        v-if="commandDialogOpen"
        @close="commandDialogOpen = false"
      />
      <CreateWorkspaceDialog
        v-if="createWorkspaceDialogOpen"
        @close="createWorkspaceDialogOpen = false"
      />
      <WorkspaceSettingsDialog
        v-if="workspaceSettingsDialogOpen"
        @close="workspaceSettingsDialogOpen = false"
      />
    </Teleport>
  </header>
</template>
