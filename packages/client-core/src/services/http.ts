import { listen } from "@tauri-apps/api/event";
import { invokeCommand } from "../commands/invoke";
import { modelRepository } from "../models/repository";
import type {
  HttpBodyRead,
  HttpProgress,
  HttpResponse,
  HttpStateEvent,
  HttpTaskStarted,
  TimelineEvent,
} from "../models/types";

export const httpService = {
  async send(
    requestId: string,
    environmentId?: string,
  ): Promise<HttpTaskStarted> {
    await modelRepository.flush({ modelId: requestId });
    return invokeCommand("http_send", {
      requestId,
      environmentId: environmentId ?? null,
    });
  },

  cancel(taskId: string): Promise<boolean> {
    return invokeCommand("http_cancel", { taskId });
  },

  readBody(
    responseId: string,
    offset = 0,
    limit = 1024 * 1024,
  ): Promise<HttpBodyRead> {
    return invokeCommand("http_response_body_read", {
      responseId,
      offset,
      limit,
    });
  },

  history(requestId: string, limit = 50): Promise<HttpResponse[]> {
    return invokeCommand("http_response_history", { requestId, limit });
  },

  latest(workspaceId: string): Promise<HttpResponse[]> {
    return invokeCommand("http_response_latest", { workspaceId });
  },

  timeline(responseId: string): Promise<TimelineEvent[]> {
    return invokeCommand("http_response_events", { responseId });
  },

  async onProgress(
    handler: (progress: HttpProgress) => void,
  ): Promise<() => void> {
    return listen<HttpProgress>("crono:http-progress", ({ payload }) =>
      handler(payload),
    );
  },

  async onState(
    handler: (state: HttpStateEvent) => void,
  ): Promise<() => void> {
    return listen<HttpStateEvent>("crono:http-state", ({ payload }) =>
      handler(payload),
    );
  },
};
