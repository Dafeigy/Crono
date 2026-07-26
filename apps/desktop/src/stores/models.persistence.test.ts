// @vitest-environment jsdom

import {
  modelRepository,
  type HttpRequest,
  type WorkspaceSnapshot,
} from "@crono/client-core";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModelsStore } from "./models";

describe("models navigation persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    vi.restoreAllMocks();
  });

  it("hydrates the last workspace and restores its last active request", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const request: HttpRequest = {
      id: "request-two",
      workspaceId: "workspace-two",
      folderId: null,
      name: "Last request",
      method: "GET",
      url: "https://api.example.com",
      parameters: [],
      headers: [],
      body: { type: "none" },
      authentication: { type: "none" },
      timeoutMs: 30_000,
      sortPriority: 1000,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const snapshot: WorkspaceSnapshot = {
      sequence: 0,
      settings: {
        id: "settings",
        locale: "en-US",
        appearance: "system",
        themeLight: "crono-light",
        themeDark: "crono-dark",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      workspaces: [
        {
          id: "workspace-one",
          name: "One",
          description: "",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: "workspace-two",
          name: "Two",
          description: "",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      folders: [],
      environments: [],
      cookieJars: [],
      httpRequests: [request],
    };
    localStorage.setItem("crono:active-workspace", "workspace-two");
    localStorage.setItem(
      "crono:active-requests",
      JSON.stringify({ "workspace-two": "request-two" }),
    );
    vi.spyOn(modelRepository, "onWrite").mockResolvedValue(() => undefined);
    const hydrate = vi
      .spyOn(modelRepository, "hydrate")
      .mockResolvedValue(snapshot);

    const store = useModelsStore();
    await store.initialize();

    expect(hydrate).toHaveBeenCalledWith("workspace-two");
    expect(store.activeWorkspaceId).toBe("workspace-two");
    expect(store.currentRequest).toEqual(request);
  });
});
