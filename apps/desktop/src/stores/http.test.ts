// @vitest-environment jsdom

import {
  httpService,
  type HttpResponse,
  type TimelineEvent,
} from "@crono/client-core";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHttpStore } from "./http";

function response(id: string, requestId: string): HttpResponse {
  return {
    id,
    requestId,
    workspaceId: "workspace-personal",
    taskId: `task-${id}`,
    state: "closed",
    method: "GET",
    url: "https://api.example.com",
    status: 200,
    statusText: "OK",
    requestHeaders: [],
    headers: [],
    bodyPath: `${id}.body`,
    bodySize: 2,
    contentType: "application/json",
    elapsedMs: 10,
    errorCode: null,
    errorDetail: null,
    createdAt: 2,
    updatedAt: 2,
  };
}

describe("http store", () => {
  beforeEach(() => {
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

  it("opens the latest response when loading a request history", async () => {
    const latest = response("response-latest", "request-one");
    const event: TimelineEvent = {
      id: "event-one",
      responseId: latest.id,
      eventType: "complete",
      title: "Complete",
      detail: null,
      timestampMs: 10,
    };
    vi.spyOn(httpService, "history").mockResolvedValue([latest]);
    vi.spyOn(httpService, "readBody").mockResolvedValue({
      content: "{}",
      offset: 0,
      nextOffset: 2,
      eof: true,
      isText: true,
    });
    vi.spyOn(httpService, "timeline").mockResolvedValue([event]);

    const store = useHttpStore();
    await store.loadHistory("request-one");

    expect(store.activeResponse).toEqual(latest);
    expect(store.body).toBe("{}");
    expect(store.timeline).toEqual([event]);
  });

  it("clears the previous response when the selected request has no history", async () => {
    const previous = response("response-previous", "request-one");
    vi.spyOn(httpService, "history")
      .mockResolvedValueOnce([previous])
      .mockResolvedValueOnce([]);
    vi.spyOn(httpService, "readBody").mockResolvedValue({
      content: "{}",
      offset: 0,
      nextOffset: 2,
      eof: true,
      isText: true,
    });
    vi.spyOn(httpService, "timeline").mockResolvedValue([]);

    const store = useHttpStore();
    await store.loadHistory("request-one");
    await store.loadHistory("request-two");

    expect(store.activeRequestId).toBe("request-two");
    expect(store.activeResponse).toBeUndefined();
    expect(store.body).toBe("");
    expect(store.history).toEqual([]);
  });

  it("deletes the active response and opens the next newest response", async () => {
    const latest = response("response-latest", "request-one");
    const previous = {
      ...response("response-previous", "request-one"),
      createdAt: 1,
      updatedAt: 1,
    };
    vi.spyOn(httpService, "history").mockResolvedValue([latest, previous]);
    vi.spyOn(httpService, "readBody").mockResolvedValue({
      content: "{}",
      offset: 0,
      nextOffset: 2,
      eof: true,
      isText: true,
    });
    vi.spyOn(httpService, "timeline").mockResolvedValue([]);
    vi.spyOn(httpService, "deleteResponse").mockResolvedValue(true);

    const store = useHttpStore();
    await store.loadHistory("request-one");
    await store.deleteResponse(latest.id);

    expect(httpService.deleteResponse).toHaveBeenCalledWith(latest.id);
    expect(store.history).toEqual([previous]);
    expect(store.activeResponse).toEqual(previous);
    expect(store.latestResponses["request-one"]).toEqual(previous);
  });

  it("clears all response history for the active request", async () => {
    const latest = response("response-latest", "request-one");
    vi.spyOn(httpService, "history").mockResolvedValue([latest]);
    vi.spyOn(httpService, "readBody").mockResolvedValue({
      content: "{}",
      offset: 0,
      nextOffset: 2,
      eof: true,
      isText: true,
    });
    vi.spyOn(httpService, "timeline").mockResolvedValue([]);
    vi.spyOn(httpService, "clearHistory").mockResolvedValue(1);

    const store = useHttpStore();
    await store.loadHistory("request-one");
    await store.clearHistory();

    expect(httpService.clearHistory).toHaveBeenCalledWith("request-one");
    expect(store.history).toEqual([]);
    expect(store.activeResponse).toBeUndefined();
    expect(store.body).toBe("");
    expect(store.latestResponses["request-one"]).toBeUndefined();
  });
});
