<script setup lang="ts">
import type { Folder as FolderModel, HttpRequest } from "@crono/client-core";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileJson2,
  Folder,
  FolderPlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-vue-next";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useHttpStore } from "../../stores/http";
import { useModelsStore } from "../../stores/models";
import { shortcutLabel } from "../../shortcuts";
import { useUiStore } from "../../stores/ui";

type ContextTarget =
  | { kind: "folder"; value: FolderModel }
  | { kind: "http_request"; value: HttpRequest };

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const models = useModelsStore();
const http = useHttpStore();
const ui = useUiStore();
const width = ref(250);
const filter = ref("");
const editingId = ref<string>();
const editingName = ref("");
const editingValue = ref<FolderModel | HttpRequest>();
const contextTarget = ref<ContextTarget>();
const deleteTarget = ref<ContextTarget>();
const deleteDialogElement = ref<HTMLElement>();
const deleting = ref(false);
const collapsedFolderIds = ref(new Set<string>());
const draggedRequestId = ref<string>();
const dropFolderId = ref<string>();
const suppressRequestClickId = ref<string>();
const contextPosition = ref({ x: 0, y: 0 });
const contextMenuElement = ref<HTMLElement>();
const searchInput = ref<HTMLInputElement>();
const sidebarRoot = ref<HTMLElement>();
let dragging = false;
let pendingRequestDrag:
  | { pointerId: number; requestId: string; startX: number; startY: number }
  | undefined;

const workspaceFolders = computed(() =>
  models.folders
    .filter(({ workspaceId }) => workspaceId === models.activeWorkspaceId)
    .sort((left, right) => left.sortPriority - right.sortPriority),
);
const workspaceRequests = computed(() =>
  models.httpRequests
    .filter(({ workspaceId }) => workspaceId === models.activeWorkspaceId)
    .sort((left, right) => left.sortPriority - right.sortPriority),
);
const visibleFolders = computed(() => {
  const query = filter.value.trim().toLocaleLowerCase();
  if (!query) return workspaceFolders.value;
  return workspaceFolders.value.filter(
    (folder) =>
      folder.name.toLocaleLowerCase().includes(query) ||
      workspaceRequests.value.some(
        (request) =>
          request.folderId === folder.id &&
          request.name.toLocaleLowerCase().includes(query),
      ),
  );
});
const visibleRootRequests = computed(() => requestsForFolder(null));
const activeRequest = computed(() => {
  const routeRequestId =
    typeof route.query.request === "string" ? route.query.request : undefined;
  return (
    workspaceRequests.value.find(({ id }) => id === routeRequestId) ??
    models.currentRequest
  );
});

function requestsForFolder(folderId: string | null) {
  const query = filter.value.trim().toLocaleLowerCase();
  return workspaceRequests.value.filter(
    (request) =>
      request.folderId === folderId &&
      (!query || request.name.toLocaleLowerCase().includes(query)),
  );
}

function latestStatus(requestId: string) {
  const response = http.latestResponses[requestId];
  if (!response) return undefined;
  return response.status?.toString() ?? (response.state === "failed" ? "ERR" : undefined);
}

function statusTone(requestId: string) {
  const response = http.latestResponses[requestId];
  if (response?.state === "failed") return "danger";
  if (response?.state === "cancelled") return "warning";
  const status = response?.status;
  if (!status) return "neutral";
  if (status >= 200 && status < 300) return "success";
  if (status >= 400) return "danger";
  return "warning";
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function modelId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

async function createFolder() {
  const workspaceId = models.activeWorkspaceId;
  if (!workspaceId) return;
  const value: FolderModel = {
    id: modelId("fl"),
    workspaceId,
    parentId: null,
    name: t("workspace.untitledFolder"),
    sortPriority: Date.now(),
    createdAt: now(),
    updatedAt: now(),
  };
  await models.queueModel({ model: "folder", data: value });
  startRename(value);
}

async function createRequest(folderId?: string) {
  const workspaceId = models.activeWorkspaceId;
  if (!workspaceId) return;
  const value: HttpRequest = {
    id: modelId("rq"),
    workspaceId,
    folderId:
      folderId === undefined ? (activeRequest.value?.folderId ?? null) : folderId,
    name: t("request.untitled"),
    method: "GET",
    url: "",
    parameters: [],
    headers: [],
    body: { type: "none" },
    authentication: { type: "none" },
    timeoutMs: 30_000,
    sortPriority: Date.now(),
    createdAt: now(),
    updatedAt: now(),
  };
  await models.queueModel({ model: "http_request", data: value });
  await router.push({ path: "/", query: { request: value.id } });
  startRename(value);
}

async function startRename(value: FolderModel | HttpRequest) {
  closeContextMenu();
  editingId.value = value.id;
  editingName.value = value.name;
  editingValue.value = value;
  await nextTick();
  const input = document.querySelector<HTMLInputElement>(
    `[data-model-id="${value.id}"] input`,
  );
  input?.focus();
  input?.select();
}

async function saveRename(value: FolderModel | HttpRequest) {
  const name = editingName.value.trim();
  editingId.value = undefined;
  editingValue.value = undefined;
  if (!name || name === value.name) return;
  const updated = { ...value, name, updatedAt: now() };
  await models.queueModel({
    model: "method" in updated ? "http_request" : "folder",
    data: updated,
  } as Parameters<typeof models.queueModel>[0]);
}

async function duplicateRequest(request: HttpRequest) {
  closeContextMenu();
  const change = await models.duplicateModel(
    "http_request",
    request.id,
    t("workspace.copyName", { name: request.name }),
  );
  if (change?.model?.model === "http_request") {
    await router.push({ path: "/", query: { request: change.model.data.id } });
  }
}

async function confirmDelete() {
  const target = deleteTarget.value;
  if (!target) return;
  deleting.value = true;
  try {
    await models.deleteModel(
      target.kind,
      target.value.id,
      target.value.workspaceId,
    );
    const selectedRequestId = route.query.request;
    const deletesSelectedRequest =
      selectedRequestId === target.value.id ||
      (target.kind === "folder" &&
        activeRequest.value?.folderId === target.value.id);
    if (deletesSelectedRequest) await router.push("/");
    deleteTarget.value = undefined;
  } finally {
    deleting.value = false;
  }
}

async function openContextMenu(
  event: MouseEvent,
  target: ContextTarget,
) {
  event.preventDefault();
  contextTarget.value = target;
  contextPosition.value = {
    x: Math.min(event.clientX, window.innerWidth - 180),
    y: Math.min(event.clientY, window.innerHeight - 150),
  };
  await nextTick();
  contextMenuElement.value?.focus();
}

function closeContextMenu() {
  contextTarget.value = undefined;
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target;
  if (editingId.value && editingValue.value && target instanceof Element) {
    const owner = target.closest<HTMLElement>("[data-model-id]");
    if (owner?.dataset.modelId !== editingId.value) {
      void saveRename(editingValue.value);
    }
  }
  if (
    contextTarget.value &&
    !contextMenuElement.value?.contains(event.target as Node)
  ) {
    closeContextMenu();
  }
}

function onContextFocusOut() {
  window.setTimeout(() => {
    if (
      contextTarget.value &&
      !contextMenuElement.value?.contains(document.activeElement)
    ) {
      closeContextMenu();
    }
  }, 0);
}

async function openDeleteDialog() {
  const target = contextTarget.value;
  if (!target) return;
  deleteTarget.value = target;
  closeContextMenu();
  await nextTick();
  deleteDialogElement.value
    ?.querySelector<HTMLButtonElement>("[data-cancel-delete]")
    ?.focus();
}

function closeDeleteDialog() {
  if (deleting.value) return;
  deleteTarget.value = undefined;
}

function toggleFolder(folderId: string) {
  const next = new Set(collapsedFolderIds.value);
  if (next.has(folderId)) next.delete(folderId);
  else next.add(folderId);
  collapsedFolderIds.value = next;
}

function isFolderCollapsed(folderId: string) {
  return collapsedFolderIds.value.has(folderId);
}

function resetRequestDrag() {
  pendingRequestDrag = undefined;
  draggedRequestId.value = undefined;
  dropFolderId.value = undefined;
  window.removeEventListener("pointermove", onRequestPointerMove);
  window.removeEventListener("pointerup", finishRequestPointerDrag);
  window.removeEventListener("pointercancel", cancelRequestPointerDrag);
}

function startRequestPointerDrag(event: PointerEvent, request: HttpRequest) {
  if (event.button !== 0 || editingId.value === request.id) return;
  pendingRequestDrag = {
    pointerId: event.pointerId,
    requestId: request.id,
    startX: event.clientX,
    startY: event.clientY,
  };
  window.addEventListener("pointermove", onRequestPointerMove, {
    passive: false,
  });
  window.addEventListener("pointerup", finishRequestPointerDrag);
  window.addEventListener("pointercancel", cancelRequestPointerDrag);
}

function onRequestPointerMove(event: PointerEvent) {
  const pending = pendingRequestDrag;
  if (!pending || event.pointerId !== pending.pointerId) return;
  if (!draggedRequestId.value) {
    const distance = Math.hypot(
      event.clientX - pending.startX,
      event.clientY - pending.startY,
    );
    if (distance < 6) return;
    draggedRequestId.value = pending.requestId;
  }
  event.preventDefault();
  const target =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>(
          ".tree-folder-group[data-folder-id]",
        )
      : null;
  dropFolderId.value = target?.dataset.folderId;
}

async function moveRequestToFolder(requestId: string, folderId: string) {
  const request = workspaceRequests.value.find(({ id }) => id === requestId);
  if (!request || request.folderId === folderId) return;
  await models.queueModel({
    model: "http_request",
    data: {
      ...request,
      folderId,
      sortPriority: Date.now(),
      updatedAt: now(),
    },
  });
  const next = new Set(collapsedFolderIds.value);
  next.delete(folderId);
  collapsedFolderIds.value = next;
}

function finishRequestPointerDrag(event: PointerEvent) {
  const pending = pendingRequestDrag;
  if (!pending || event.pointerId !== pending.pointerId) return;
  const wasDragging = draggedRequestId.value === pending.requestId;
  const folderId = dropFolderId.value;
  if (wasDragging) {
    event.preventDefault();
    suppressRequestClickId.value = pending.requestId;
    window.setTimeout(() => {
      if (suppressRequestClickId.value === pending.requestId) {
        suppressRequestClickId.value = undefined;
      }
    }, 0);
  }
  resetRequestDrag();
  if (wasDragging && folderId) {
    void moveRequestToFolder(pending.requestId, folderId);
  }
}

function cancelRequestPointerDrag() {
  resetRequestDrag();
}

function onRequestClick(event: MouseEvent, requestId: string) {
  if (suppressRequestClickId.value !== requestId) return;
  event.preventDefault();
  event.stopPropagation();
  suppressRequestClickId.value = undefined;
}

function applyWidth(value: number) {
  width.value = Math.min(420, Math.max(210, value));
  document.documentElement.style.setProperty("--collection-width", `${width.value}px`);
}

function onPointerMove(event: PointerEvent) {
  if (dragging) applyWidth(event.clientX);
}

function stopDragging() {
  dragging = false;
  document.body.classList.remove("is-resizing");
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", stopDragging);
}

function startDragging(event: PointerEvent) {
  dragging = true;
  document.body.classList.add("is-resizing");
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", stopDragging);
}

function onHandleKeydown(event: KeyboardEvent) {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    applyWidth(width.value + (event.key === "ArrowLeft" ? -12 : 12));
  }
}

watch(
  () => models.activeWorkspaceId,
  (workspaceId) => {
    if (workspaceId) {
      void http.loadLatestResponses(workspaceId).catch(() => undefined);
    }
  },
  { immediate: true },
);

watch(
  () => models.activeWorkspaceId,
  () => {
    editingId.value = undefined;
    editingValue.value = undefined;
    collapsedFolderIds.value = new Set();
    deleteTarget.value = undefined;
    closeContextMenu();
  },
);

watch(
  () => ui.sidebarOpen,
  (open) => {
    if (open) return;
    if (editingId.value && editingValue.value) {
      void saveRename(editingValue.value);
    }
    closeContextMenu();
    closeDeleteDialog();
  },
);

function onRenameModel(event: Event) {
  const id = (event as CustomEvent<{ id?: string }>).detail?.id;
  const value =
    models.folders.find((item) => item.id === id) ??
    models.httpRequests.find((item) => item.id === id);
  if (value) void startRename(value);
}

function focusSidebarSearch() {
  searchInput.value?.focus();
  searchInput.value?.select();
}

function navigableTreeRows() {
  return [
    ...(sidebarRoot.value?.querySelectorAll<HTMLElement>(
      ".collection-tree .tree-row",
    ) ?? []),
  ].filter((row) => window.getComputedStyle(row).display !== "none");
}

async function focusSidebarTree() {
  await nextTick();
  const rows = navigableTreeRows();
  const activeRow =
    rows.find((row) => row.classList.contains("is-active")) ?? rows[0];
  activeRow?.focus();
}

function onSidebarNavigation(event: KeyboardEvent) {
  const target = event.target;
  if (
    !(target instanceof HTMLElement) ||
    !sidebarRoot.value?.contains(target) ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return;
  }

  const key = event.key.toLocaleLowerCase();
  const vimKey =
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (key === "j" || key === "k");
  const moveDown = event.key === "ArrowDown" || (vimKey && key === "j");
  const moveUp = event.key === "ArrowUp" || (vimKey && key === "k");
  if (!moveDown && !moveUp) return;

  const rows = navigableTreeRows();
  const currentRow = target.closest<HTMLElement>(".tree-row");
  const currentIndex = currentRow ? rows.indexOf(currentRow) : -1;
  if (!rows.length) return;
  event.preventDefault();
  const nextIndex =
    currentIndex < 0
      ? 0
      : (currentIndex + (moveDown ? 1 : -1) + rows.length) % rows.length;
  rows[nextIndex]?.focus();
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  window.addEventListener("blur", closeContextMenu);
  window.addEventListener("crono:rename-model", onRenameModel);
  window.addEventListener("crono:focus-sidebar-search", focusSidebarSearch);
  window.addEventListener("crono:focus-sidebar-tree", focusSidebarTree);
  document.addEventListener("keydown", onSidebarNavigation);
});
onBeforeUnmount(() => {
  if (editingId.value && editingValue.value) {
    void saveRename(editingValue.value);
  }
  resetRequestDrag();
  stopDragging();
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  window.removeEventListener("blur", closeContextMenu);
  window.removeEventListener("crono:rename-model", onRenameModel);
  window.removeEventListener("crono:focus-sidebar-search", focusSidebarSearch);
  window.removeEventListener("crono:focus-sidebar-tree", focusSidebarTree);
  document.removeEventListener("keydown", onSidebarNavigation);
});
</script>

<template>
  <aside
    ref="sidebarRoot"
    class="collection-sidebar"
    :class="{ 'is-request-dragging': draggedRequestId }"
  >
    <div class="sidebar-toolbar">
      <span class="sidebar-heading">{{ t("app.collections") }}</span>
      <div class="sidebar-actions">
        <button
          class="subtle-icon-button"
          type="button"
          :aria-label="t('workspace.newFolder')"
          :title="t('workspace.newFolder')"
          @click="createFolder"
        >
          <FolderPlus :size="15" />
        </button>
        <button
          class="subtle-icon-button"
          type="button"
          :aria-label="t('workspace.newRequest')"
          :title="`${t('workspace.newRequest')} (${shortcutLabel('newRequest')})`"
          @click="createRequest()"
        >
          <Plus :size="16" />
        </button>
      </div>
    </div>

    <label class="sidebar-search">
      <Search :size="14" aria-hidden="true" />
      <span class="sr-only">{{ t("workspace.filter") }}</span>
      <input
        ref="searchInput"
        v-model="filter"
        :placeholder="t('workspace.filter')"
        :title="`${t('workspace.filter')} (${shortcutLabel('searchRequests')})`"
      />
      <button
        v-if="filter"
        type="button"
        :aria-label="t('common.clear')"
        @click="filter = ''"
      >
        <X :size="13" />
      </button>
    </label>

    <div class="collection-tree">
      <div
        v-for="request in visibleRootRequests"
        :key="request.id"
        class="tree-request-wrap"
        :class="{ 'is-dragging': draggedRequestId === request.id }"
        :data-model-id="request.id"
        @contextmenu="openContextMenu($event, { kind: 'http_request', value: request })"
      >
        <RouterLink
          class="tree-row tree-request tree-request-root"
          :class="{
            'is-active':
              (route.query.request ?? models.currentRequest?.id) === request.id,
          }"
          :to="{ path: '/', query: { request: request.id } }"
          draggable="false"
          @pointerdown="startRequestPointerDrag($event, request)"
          @click.capture="onRequestClick($event, request.id)"
          @dblclick.prevent.stop="startRename(request)"
        >
          <span class="method-dot" :class="`method-${request.method.toLowerCase()}`">
            {{ request.method }}
          </span>
          <FileJson2 :size="14" aria-hidden="true" />
          <input
            v-if="editingId === request.id"
            v-model="editingName"
            autofocus
            @click.prevent
            @keydown.enter.prevent="saveRename(request)"
            @keydown.escape.prevent="editingId = undefined"
            @blur="saveRename(request)"
          />
          <span v-else>{{ request.name }}</span>
          <small
            v-if="latestStatus(request.id)"
            class="request-status"
            :class="`is-${statusTone(request.id)}`"
          >
            {{ latestStatus(request.id) }}
          </small>
        </RouterLink>
      </div>

      <div
        v-for="folder in visibleFolders"
        :key="folder.id"
        class="tree-folder-group"
        :class="{ 'is-drop-target': dropFolderId === folder.id }"
        :data-folder-id="folder.id"
      >
        <button
          class="tree-row tree-folder"
          type="button"
          :data-model-id="folder.id"
          :aria-expanded="!isFolderCollapsed(folder.id)"
          @click="toggleFolder(folder.id)"
          @dblclick.prevent="startRename(folder)"
          @contextmenu="openContextMenu($event, { kind: 'folder', value: folder })"
        >
          <ChevronDown
            v-if="!isFolderCollapsed(folder.id)"
            :size="14"
            aria-hidden="true"
          />
          <ChevronRight v-else :size="14" aria-hidden="true" />
          <Folder :size="15" aria-hidden="true" />
          <input
            v-if="editingId === folder.id"
            v-model="editingName"
            autofocus
            @click.stop
            @keydown.enter.prevent="saveRename(folder)"
            @keydown.escape.prevent="editingId = undefined"
            @blur="saveRename(folder)"
          />
          <span v-else>{{ folder.name }}</span>
          <small>{{ requestsForFolder(folder.id).length }}</small>
        </button>

        <div
          v-for="request in requestsForFolder(folder.id)"
          v-show="!isFolderCollapsed(folder.id) || filter.trim()"
          :key="request.id"
          class="tree-request-wrap"
          :class="{ 'is-dragging': draggedRequestId === request.id }"
          :data-model-id="request.id"
          @contextmenu="openContextMenu($event, { kind: 'http_request', value: request })"
        >
          <RouterLink
            class="tree-row tree-request"
            :class="{
              'is-active':
                (route.query.request ?? models.currentRequest?.id) === request.id,
            }"
            :to="{ path: '/', query: { request: request.id } }"
            draggable="false"
            @pointerdown="startRequestPointerDrag($event, request)"
            @click.capture="onRequestClick($event, request.id)"
            @dblclick.prevent.stop="startRename(request)"
          >
            <span
              class="method-dot"
              :class="`method-${request.method.toLowerCase()}`"
            >
              {{ request.method }}
            </span>
            <FileJson2 :size="14" aria-hidden="true" />
            <input
              v-if="editingId === request.id"
              v-model="editingName"
              autofocus
              @click.prevent
              @keydown.enter.prevent="saveRename(request)"
              @keydown.escape.prevent="editingId = undefined"
              @blur="saveRename(request)"
            />
            <span v-else>{{ request.name }}</span>
            <small
              v-if="latestStatus(request.id)"
              class="request-status"
              :class="`is-${statusTone(request.id)}`"
            >
              {{ latestStatus(request.id) }}
            </small>
          </RouterLink>
        </div>
      </div>

      <p
        v-if="!visibleRootRequests.length && !visibleFolders.length"
        class="tree-empty"
      >
        {{ t("workspace.noMatches") }}
      </p>
    </div>

    <div
      class="resize-handle"
      role="separator"
      aria-orientation="vertical"
      :aria-valuenow="width"
      aria-valuemin="210"
      aria-valuemax="420"
      tabindex="0"
      @pointerdown="startDragging"
      @keydown="onHandleKeydown"
    />

    <Teleport to="body">
      <div
        v-if="contextTarget"
        ref="contextMenuElement"
        class="collection-context-menu"
        :style="{ left: `${contextPosition.x}px`, top: `${contextPosition.y}px` }"
        role="menu"
        tabindex="-1"
        @focusout="onContextFocusOut"
        @contextmenu.prevent
      >
        <button
          type="button"
          role="menuitem"
          @click="startRename(contextTarget.value)"
        >
          <Pencil :size="13" />{{ t("common.rename") }}
        </button>
        <button
          v-if="contextTarget.kind === 'folder'"
          type="button"
          role="menuitem"
          @click="createRequest(contextTarget.value.id); closeContextMenu()"
        >
          <Plus :size="13" />{{ t("workspace.newRequest") }}
        </button>
        <button
          v-else
          type="button"
          role="menuitem"
          @click="duplicateRequest(contextTarget.value)"
        >
          <Copy :size="13" />{{ t("common.duplicate") }}
        </button>
        <button class="is-danger" type="button" role="menuitem" @click="openDeleteDialog">
          <Trash2 :size="13" />{{ t("common.delete") }}
        </button>
      </div>

      <div
        v-if="deleteTarget"
        class="app-dialog-backdrop"
        @pointerdown.self="closeDeleteDialog"
      >
        <section
          ref="deleteDialogElement"
          class="collection-delete-dialog"
          role="alertdialog"
          aria-modal="true"
          :aria-labelledby="`delete-title-${deleteTarget.value.id}`"
          :aria-describedby="`delete-description-${deleteTarget.value.id}`"
          @keydown.esc.prevent="closeDeleteDialog"
        >
          <header>
            <span class="collection-delete-icon" aria-hidden="true">
              <Trash2 :size="17" />
            </span>
            <div>
              <h2 :id="`delete-title-${deleteTarget.value.id}`">
                {{
                  t(
                    deleteTarget.kind === "folder"
                      ? "workspace.deleteFolderTitle"
                      : "workspace.deleteRequestTitle",
                  )
                }}
              </h2>
              <p :id="`delete-description-${deleteTarget.value.id}`">
                {{
                  t(
                    deleteTarget.kind === "folder"
                      ? "workspace.deleteFolderDescription"
                      : "workspace.deleteRequestDescription",
                    { name: deleteTarget.value.name },
                  )
                }}
              </p>
            </div>
          </header>
          <div class="collection-delete-actions">
            <button
              data-cancel-delete
              class="secondary-button"
              type="button"
              :disabled="deleting"
              @click="closeDeleteDialog"
            >
              {{ t("common.cancel") }}
            </button>
          <button
              class="danger-button"
            type="button"
              :disabled="deleting"
            @click="confirmDelete"
          >
              {{ deleting ? t("request.deleting") : t("common.delete") }}
          </button>
          </div>
        </section>
      </div>
    </Teleport>
  </aside>
</template>
