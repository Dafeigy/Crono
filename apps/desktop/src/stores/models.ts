import {
  modelRepository,
  type CookieJar,
  type Environment,
  type Folder,
  type HttpRequest,
  type Model,
  type ModelChange,
  type Settings,
  type Workspace,
  type WorkspaceSnapshot,
} from "@crono/client-core";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

const ACTIVE_WORKSPACE_STORAGE_KEY = "crono:active-workspace";
const ACTIVE_REQUESTS_STORAGE_KEY = "crono:active-requests";

function readStoredValue(key: string) {
  if (typeof localStorage === "undefined") return undefined;
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function readActiveRequests(): Record<string, string> {
  const value = readStoredValue(ACTIVE_REQUESTS_STORAGE_KEY);
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function storeValue(key: string, value: string) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Persistence is a convenience; keep navigation working if storage is blocked.
  }
}

function browserSnapshot(): WorkspaceSnapshot {
  const now = Math.floor(Date.now() / 1000);
  return {
    sequence: 0,
    settings: {
      id: "settings",
      locale: "en-US",
      appearance: "system",
      themeLight: "crono-light",
      themeDark: "crono-dark",
      createdAt: now,
      updatedAt: now,
    },
    workspaces: [
      {
        id: "workspace-personal",
        name: "Personal APIs",
        description: "",
        createdAt: now,
        updatedAt: now,
      },
    ],
    folders: [
      {
        id: "folder-public-apis",
        workspaceId: "workspace-personal",
        parentId: null,
        name: "Public APIs",
        sortPriority: 1000,
        createdAt: now,
        updatedAt: now,
      },
    ],
    environments: [],
    cookieJars: [],
    httpRequests: [
      {
        id: "request-health-check",
        workspaceId: "workspace-personal",
        folderId: "folder-public-apis",
        name: "Health check",
        method: "GET",
        url: "https://api.example.com/v1/health",
        parameters: [],
        headers: [],
        body: { type: "none" },
        authentication: { type: "none" },
        timeoutMs: 30_000,
        sortPriority: 1000,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function replaceById<T extends { id: string }>(values: T[], value: T): T[] {
  const index = values.findIndex((candidate) => candidate.id === value.id);
  if (index < 0) return [...values, value];
  const next = [...values];
  next[index] = value;
  return next;
}

export const useModelsStore = defineStore("models", () => {
  const sequence = ref(0);
  const settings = ref<Settings>(browserSnapshot().settings);
  const workspaces = ref<Workspace[]>([]);
  const folders = ref<Folder[]>([]);
  const environments = ref<Environment[]>([]);
  const cookieJars = ref<CookieJar[]>([]);
  const httpRequests = ref<HttpRequest[]>([]);
  const activeWorkspaceId = ref<string | undefined>(
    readStoredValue(ACTIVE_WORKSPACE_STORAGE_KEY),
  );
  const activeRequestIds = ref<Record<string, string>>(readActiveRequests());
  const activeEnvironmentId = ref<string>();
  const initialized = ref(false);
  const persistenceAvailable = ref(false);
  let disposeWriteListener: (() => void) | undefined;

  const currentWorkspace = computed(
    () =>
      workspaces.value.find(({ id }) => id === activeWorkspaceId.value) ??
      workspaces.value[0],
  );
  const currentEnvironment = computed(() =>
    environments.value.find(({ id }) => id === activeEnvironmentId.value),
  );
  const currentRequest = computed(() => {
    const workspaceId = activeWorkspaceId.value;
    if (!workspaceId) return undefined;
    const requestId = activeRequestIds.value[workspaceId];
    return (
      httpRequests.value.find(
        ({ id, workspaceId: ownerId }) =>
          id === requestId && ownerId === workspaceId,
      ) ??
      httpRequests.value.find(({ workspaceId: ownerId }) => ownerId === workspaceId)
    );
  });

  function persistActiveWorkspace() {
    if (activeWorkspaceId.value) {
      storeValue(ACTIVE_WORKSPACE_STORAGE_KEY, activeWorkspaceId.value);
    }
  }

  function persistActiveRequests() {
    storeValue(
      ACTIVE_REQUESTS_STORAGE_KEY,
      JSON.stringify(activeRequestIds.value),
    );
  }

  function reconcileActiveRequest() {
    const workspaceId = activeWorkspaceId.value;
    if (!workspaceId) return;
    const request = currentRequest.value;
    if (request && activeRequestIds.value[workspaceId] !== request.id) {
      activeRequestIds.value = {
        ...activeRequestIds.value,
        [workspaceId]: request.id,
      };
      persistActiveRequests();
    }
  }

  function applySnapshot(snapshot: WorkspaceSnapshot) {
    sequence.value = snapshot.sequence;
    settings.value = snapshot.settings;
    workspaces.value = snapshot.workspaces;
    folders.value = snapshot.folders;
    environments.value = snapshot.environments;
    cookieJars.value = snapshot.cookieJars;
    httpRequests.value = snapshot.httpRequests;
    if (
      !snapshot.workspaces.some(({ id }) => id === activeWorkspaceId.value)
    ) {
      activeWorkspaceId.value = snapshot.workspaces[0]?.id;
    }
    persistActiveWorkspace();
    reconcileActiveRequest();
    if (
      !environments.value.some(
        ({ id, workspaceId }) =>
          id === activeEnvironmentId.value &&
          workspaceId === activeWorkspaceId.value,
      )
    ) {
      activeEnvironmentId.value = environments.value.find(
        ({ workspaceId }) => workspaceId === activeWorkspaceId.value,
      )?.id;
    }
  }

  function applyModel(model: Model) {
    switch (model.model) {
      case "settings":
        settings.value = model.data;
        break;
      case "workspace":
        workspaces.value = replaceById(workspaces.value, model.data);
        break;
      case "folder":
        folders.value = replaceById(folders.value, model.data);
        break;
      case "environment":
        environments.value = replaceById(environments.value, model.data);
        break;
      case "cookie_jar":
        cookieJars.value = replaceById(cookieJars.value, model.data);
        break;
      case "http_request":
        httpRequests.value = replaceById(httpRequests.value, model.data);
        break;
    }
  }

  function removeModel(change: ModelChange) {
    switch (change.modelKind) {
      case "workspace":
        workspaces.value = workspaces.value.filter(({ id }) => id !== change.modelId);
        folders.value = folders.value.filter(
          ({ workspaceId }) => workspaceId !== change.modelId,
        );
        environments.value = environments.value.filter(
          ({ workspaceId }) => workspaceId !== change.modelId,
        );
        cookieJars.value = cookieJars.value.filter(
          ({ workspaceId }) => workspaceId !== change.modelId,
        );
        httpRequests.value = httpRequests.value.filter(
          ({ workspaceId }) => workspaceId !== change.modelId,
        );
        break;
      case "folder":
        {
          const deletedIds = new Set([change.modelId]);
          let foundDescendant = true;
          while (foundDescendant) {
            foundDescendant = false;
            for (const folder of folders.value) {
              if (
                folder.parentId &&
                deletedIds.has(folder.parentId) &&
                !deletedIds.has(folder.id)
              ) {
                deletedIds.add(folder.id);
                foundDescendant = true;
              }
            }
          }
          folders.value = folders.value.filter(({ id }) => !deletedIds.has(id));
          httpRequests.value = httpRequests.value.filter(
            ({ folderId }) => !folderId || !deletedIds.has(folderId),
          );
        }
        break;
      case "environment":
        {
          const deletedIds = new Set([change.modelId]);
          let foundDescendant = true;
          while (foundDescendant) {
            foundDescendant = false;
            for (const environment of environments.value) {
              if (
                environment.parentId &&
                deletedIds.has(environment.parentId) &&
                !deletedIds.has(environment.id)
              ) {
                deletedIds.add(environment.id);
                foundDescendant = true;
              }
            }
          }
          environments.value = environments.value.filter(
            ({ id }) => !deletedIds.has(id),
          );
          if (
            activeEnvironmentId.value &&
            deletedIds.has(activeEnvironmentId.value)
          ) {
            activeEnvironmentId.value = environments.value.find(
              ({ workspaceId }) => workspaceId === activeWorkspaceId.value,
            )?.id;
          }
        }
        break;
      case "cookie_jar":
        cookieJars.value = cookieJars.value.filter(({ id }) => id !== change.modelId);
        break;
      case "http_request":
        httpRequests.value = httpRequests.value.filter(({ id }) => id !== change.modelId);
        break;
      case "settings":
        break;
    }
  }

  async function applyChange(change: ModelChange) {
    if (change.sequence <= sequence.value) return;
    if (sequence.value > 0 && change.sequence > sequence.value + 1) {
      applySnapshot(await modelRepository.hydrate(activeWorkspaceId.value));
      return;
    }
    sequence.value = change.sequence;
    if (
      change.workspaceId &&
      change.workspaceId !== activeWorkspaceId.value
    ) {
      return;
    }
    if (change.operation === "delete") removeModel(change);
    else if (change.model) applyModel(change.model);
  }

  async function initialize() {
    if (initialized.value) return;
    initialized.value = true;
    persistenceAvailable.value =
      typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!persistenceAvailable.value) {
      applySnapshot(browserSnapshot());
      return;
    }
    disposeWriteListener = await modelRepository.onWrite((change) => {
      void applyChange(change);
    });
    const requestedWorkspaceId = activeWorkspaceId.value;
    let snapshot = await modelRepository.hydrate(requestedWorkspaceId);
    if (
      requestedWorkspaceId &&
      !snapshot.workspaces.some(({ id }) => id === requestedWorkspaceId)
    ) {
      snapshot = await modelRepository.hydrate(snapshot.workspaces[0]?.id);
    }
    applySnapshot(snapshot);
  }

  function queueModel(model: Model) {
    applyModel(model);
    if (!persistenceAvailable.value) return Promise.resolve();
    const write = modelRepository.queueUpsert(model);
    void write.catch(() => undefined);
    return write.then(() => undefined);
  }

  function queueRequestUpdate(request: HttpRequest) {
    return queueModel({ model: "http_request", data: request });
  }

  function queueSettingsUpdate(value: Settings) {
    return queueModel({ model: "settings", data: value });
  }

  function flushPendingModels() {
    if (!persistenceAvailable.value) return Promise.resolve();
    return modelRepository.flush();
  }

  async function switchWorkspace(workspaceId: string) {
    if (workspaceId === activeWorkspaceId.value) return;
    if (persistenceAvailable.value) {
      await modelRepository.flush();
      const snapshot = await modelRepository.hydrate(workspaceId);
      activeWorkspaceId.value = workspaceId;
      applySnapshot(snapshot);
    } else {
      activeWorkspaceId.value = workspaceId;
    }
    persistActiveWorkspace();
    reconcileActiveRequest();
    activeEnvironmentId.value = environments.value.find(
      ({ workspaceId: ownerId }) => ownerId === workspaceId,
    )?.id;
  }

  function selectRequest(requestId: string) {
    const request = httpRequests.value.find(({ id }) => id === requestId);
    if (!request || request.workspaceId !== activeWorkspaceId.value) return;
    activeRequestIds.value = {
      ...activeRequestIds.value,
      [request.workspaceId]: request.id,
    };
    persistActiveRequests();
  }

  async function deleteModel(
    kind: Parameters<typeof modelRepository.delete>[0],
    id: string,
    workspaceId?: string,
  ) {
    if (!persistenceAvailable.value) {
      removeModel({
        sequence: sequence.value + 1,
        sourceWindowId: modelRepository.sourceWindowId,
        operation: "delete",
        modelKind: kind,
        modelId: id,
        workspaceId: workspaceId ?? null,
        model: null,
      });
      return;
    }
    const change = await modelRepository.delete(kind, id, workspaceId);
    await applyChange(change);
  }

  async function duplicateModel(
    kind: Parameters<typeof modelRepository.duplicate>[0],
    id: string,
    name: string,
  ) {
    if (!persistenceAvailable.value) return;
    const change = await modelRepository.duplicate(kind, id, name);
    await applyChange(change);
    return change;
  }

  function dispose() {
    disposeWriteListener?.();
    disposeWriteListener = undefined;
  }

  return {
    sequence,
    settings,
    workspaces,
    folders,
    environments,
    cookieJars,
    httpRequests,
    activeWorkspaceId,
    activeRequestIds,
    activeEnvironmentId,
    initialized,
    persistenceAvailable,
    currentWorkspace,
    currentEnvironment,
    currentRequest,
    initialize,
    applyChange,
    queueRequestUpdate,
    queueSettingsUpdate,
    flushPendingModels,
    queueModel,
    switchWorkspace,
    selectRequest,
    deleteModel,
    duplicateModel,
    dispose,
  };
});
