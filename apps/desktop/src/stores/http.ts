import {
  httpService,
  isAppError,
  type AppError,
  type HttpProgress,
  type HttpResponse,
  type HttpResponseState,
  type HttpStateEvent,
  type TimelineEvent,
} from "@crono/client-core";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

const terminalStates: HttpResponseState[] = ["closed", "cancelled", "failed"];

export const useHttpStore = defineStore("http", () => {
  const activeRequestId = ref<string>();
  const activeTaskId = ref<string>();
  const activeResponse = ref<HttpResponse>();
  const state = ref<HttpResponseState>();
  const progress = ref<HttpProgress>();
  const body = ref("");
  const bodyIsText = ref(true);
  const history = ref<HttpResponse[]>([]);
  const latestResponses = ref<Record<string, HttpResponse>>({});
  const timeline = ref<TimelineEvent[]>([]);
  const error = ref<AppError>();
  const initialized = ref(false);
  const isMutatingHistory = ref(false);
  let disposeProgress: (() => void) | undefined;
  let disposeState: (() => void) | undefined;
  let historyLoadSequence = 0;
  let responseDecoder = new TextDecoder();
  let awaitingTaskStart = false;
  const pendingStateEvents = new Map<string, HttpStateEvent[]>();
  const pendingProgressEvents = new Map<string, HttpProgress[]>();

  const isBusy = computed(
    () => !!state.value && !terminalStates.includes(state.value),
  );

  async function initialize() {
    if (initialized.value) return;
    initialized.value = true;
    if (!("__TAURI_INTERNALS__" in window)) return;
    disposeProgress = await httpService.onProgress((event) => {
      if (event.taskId !== activeTaskId.value) {
        if (!awaitingTaskStart) return;
        const pending = pendingProgressEvents.get(event.taskId) ?? [];
        pending.push(event);
        pendingProgressEvents.set(event.taskId, pending);
        return;
      }
      handleProgressEvent(event);
    });
    disposeState = await httpService.onState((event) => {
      if (event.taskId !== activeTaskId.value) {
        if (!awaitingTaskStart) return;
        const pending = pendingStateEvents.get(event.taskId) ?? [];
        pending.push(event);
        pendingStateEvents.set(event.taskId, pending);
        return;
      }
      void handleStateEvent(event);
    });
  }

  function isTextContentType(contentType: string | null) {
    if (!contentType) return true;
    const value = contentType.toLowerCase();
    return (
      value.startsWith("text/") ||
      value.includes("json") ||
      value.includes("xml") ||
      value.includes("javascript") ||
      value.includes("graphql")
    );
  }

  function handleProgressEvent(event: HttpProgress) {
    if (event.taskId !== activeTaskId.value) return;
    progress.value = event;
    bodyIsText.value = isTextContentType(event.contentType);
    if (activeResponse.value?.id === event.responseId) {
      activeResponse.value = {
        ...activeResponse.value,
        status: event.status,
        statusText: event.statusText,
        contentType: event.contentType,
        bodySize: event.receivedBytes,
      };
    }
    if (bodyIsText.value && event.bodyChunk.length) {
      body.value += responseDecoder.decode(new Uint8Array(event.bodyChunk), {
        stream: true,
      });
    }
  }

  async function handleStateEvent(event: HttpStateEvent) {
    if (event.taskId !== activeTaskId.value) return;
    state.value = event.state;
    if (!event.response) return;
    if (terminalStates.includes(event.state) && bodyIsText.value) {
      body.value += responseDecoder.decode();
    }
    activeResponse.value = event.response;
    if (event.state === "closed") {
      await loadResponse(event.response);
    }
    if (event.state === "failed") {
      error.value = {
        code: event.response.errorCode ?? "http.request_failed",
        detail: event.response.errorDetail ?? undefined,
        retryable: true,
      };
    }
    if (terminalStates.includes(event.state) && activeRequestId.value) {
      history.value = await httpService.history(activeRequestId.value);
      latestResponses.value[event.response.requestId] = event.response;
    }
  }

  async function send(requestId: string, environmentId?: string) {
    await initialize();
    error.value = undefined;
    activeTaskId.value = undefined;
    activeResponse.value = undefined;
    body.value = "";
    bodyIsText.value = true;
    responseDecoder = new TextDecoder();
    timeline.value = [];
    progress.value = undefined;
    activeRequestId.value = requestId;
    state.value = "initialized";
    awaitingTaskStart = true;
    try {
      const task = await httpService.send(requestId, environmentId);
      activeTaskId.value = task.taskId;
      awaitingTaskStart = false;
      const pendingStates = pendingStateEvents.get(task.taskId) ?? [];
      pendingStateEvents.clear();
      for (const pending of pendingStates) {
        await handleStateEvent(pending);
      }
      const pendingProgress = pendingProgressEvents.get(task.taskId) ?? [];
      pendingProgressEvents.clear();
      if (!terminalStates.includes(state.value ?? "initialized")) {
        for (const pending of pendingProgress) handleProgressEvent(pending);
      }
    } catch (cause) {
      awaitingTaskStart = false;
      pendingStateEvents.clear();
      pendingProgressEvents.clear();
      state.value = "failed";
      error.value = isAppError(cause)
        ? cause
        : {
            code: "app.unexpected",
            detail: cause instanceof Error ? cause.message : String(cause),
            retryable: false,
          };
      throw cause;
    }
  }

  async function cancel() {
    if (!activeTaskId.value) return;
    await httpService.cancel(activeTaskId.value);
  }

  async function loadResponse(response: HttpResponse) {
    activeResponse.value = response;
    state.value = response.state;
    const [bodyResult, events] = await Promise.all([
      httpService.readBody(response.id),
      httpService.timeline(response.id),
    ]);
    if (activeRequestId.value !== response.requestId) return;
    body.value = bodyResult.content;
    bodyIsText.value = bodyResult.isText;
    timeline.value = events;
  }

  async function loadHistory(requestId: string) {
    const loadSequence = ++historyLoadSequence;
    activeRequestId.value = requestId;
    activeResponse.value = undefined;
    state.value = undefined;
    progress.value = undefined;
    body.value = "";
    bodyIsText.value = true;
    responseDecoder = new TextDecoder();
    timeline.value = [];
    error.value = undefined;
    const loadedHistory =
      "__TAURI_INTERNALS__" in window
        ? await httpService.history(requestId)
        : [];
    if (
      loadSequence !== historyLoadSequence ||
      activeRequestId.value !== requestId
    ) {
      return;
    }
    history.value = loadedHistory;
    const latest = history.value[0];
    if (!latest) return;
    latestResponses.value[requestId] = latest;
    await loadResponse(latest);
  }

  function clearActiveResponse() {
    activeResponse.value = undefined;
    state.value = undefined;
    progress.value = undefined;
    body.value = "";
    bodyIsText.value = true;
    responseDecoder = new TextDecoder();
    timeline.value = [];
  }

  async function deleteResponse(responseId: string) {
    const response = history.value.find(({ id }) => id === responseId);
    if (!response || isBusy.value || isMutatingHistory.value) return;
    isMutatingHistory.value = true;
    try {
      await httpService.deleteResponse(responseId);
      history.value = history.value.filter(({ id }) => id !== responseId);
      const latest = history.value[0];
      if (latest) {
        latestResponses.value[response.requestId] = latest;
      } else {
        delete latestResponses.value[response.requestId];
      }
      if (activeResponse.value?.id !== responseId) return;
      if (latest) {
        await loadResponse(latest);
      } else {
        clearActiveResponse();
      }
    } finally {
      isMutatingHistory.value = false;
    }
  }

  async function clearHistory() {
    const requestId = activeRequestId.value;
    if (!requestId || isBusy.value || isMutatingHistory.value) return;
    isMutatingHistory.value = true;
    try {
      await httpService.clearHistory(requestId);
      history.value = [];
      delete latestResponses.value[requestId];
      clearActiveResponse();
    } finally {
      isMutatingHistory.value = false;
    }
  }

  async function loadLatestResponses(workspaceId: string) {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const responses = await httpService.latest(workspaceId);
    latestResponses.value = Object.fromEntries(
      responses.map((response) => [response.requestId, response]),
    );
  }

  function dispose() {
    disposeProgress?.();
    disposeState?.();
    disposeProgress = undefined;
    disposeState = undefined;
    initialized.value = false;
  }

  return {
    activeRequestId,
    activeTaskId,
    activeResponse,
    state,
    progress,
    body,
    bodyIsText,
    history,
    latestResponses,
    timeline,
    error,
    isBusy,
    isMutatingHistory,
    initialize,
    send,
    cancel,
    loadResponse,
    loadHistory,
    deleteResponse,
    clearHistory,
    loadLatestResponses,
    dispose,
  };
});
