import {
  modelRepository,
  type Folder,
  type HttpRequest,
  type ModelChange,
} from "@crono/client-core";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModelsStore } from "./models";

describe("models store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("removes descendant folders and their requests after a folder deletion", async () => {
    const store = useModelsStore();
    await store.initialize();
    const timestamp = Math.floor(Date.now() / 1000);
    const childFolder: Folder = {
      id: "folder-child",
      workspaceId: "workspace-personal",
      parentId: "folder-public-apis",
      name: "Child",
      sortPriority: 2000,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const sourceRequest = store.httpRequests[0];
    expect(sourceRequest).toBeDefined();
    const childRequest: HttpRequest = {
      ...sourceRequest!,
      id: "request-child",
      folderId: childFolder.id,
      name: "Child request",
    };
    await store.queueModel({ model: "folder", data: childFolder });
    await store.queueModel({ model: "http_request", data: childRequest });

    await store.applyChange({
      sequence: 1,
      sourceWindowId: "other-window",
      operation: "delete",
      modelKind: "folder",
      modelId: "folder-public-apis",
      workspaceId: "workspace-personal",
      model: null,
    } satisfies ModelChange);

    expect(store.folders).toEqual([]);
    expect(store.httpRequests).toEqual([]);
  });

  it("rehydrates the active workspace when a cross-window sequence has a gap", async () => {
    const store = useModelsStore();
    await store.initialize();
    const workspace = store.currentWorkspace!;
    await store.applyChange({
      sequence: 1,
      sourceWindowId: "other-window",
      operation: "upsert",
      modelKind: "workspace",
      modelId: workspace.id,
      workspaceId: null,
      model: { model: "workspace", data: workspace },
    });
    const hydrate = vi.spyOn(modelRepository, "hydrate").mockResolvedValue({
      sequence: 3,
      settings: store.settings,
      workspaces: [{ ...workspace, name: "Hydrated workspace" }],
      folders: store.folders,
      environments: store.environments,
      cookieJars: store.cookieJars,
      httpRequests: store.httpRequests,
    });

    await store.applyChange({
      sequence: 3,
      sourceWindowId: "other-window",
      operation: "delete",
      modelKind: "http_request",
      modelId: "missing-sequence",
      workspaceId: workspace.id,
      model: null,
    });

    expect(hydrate).toHaveBeenCalledWith(workspace.id);
    expect(store.sequence).toBe(3);
    expect(store.currentWorkspace?.name).toBe("Hydrated workspace");
  });
});
