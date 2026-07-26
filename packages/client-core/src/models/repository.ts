import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  Model,
  ModelChange,
  ModelKind,
  Settings,
  WorkspaceSnapshot,
} from "./types";

export interface ModelTransport {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(
    event: string,
    handler: (payload: T) => void,
  ): Promise<() => void>;
}

const tauriTransport: ModelTransport = {
  invoke,
  async listen<T>(event: string, handler: (payload: T) => void) {
    return listen<T>(event, ({ payload }) => handler(payload));
  },
};

function createWindowId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `window-${Date.now()}`;
}

export class ModelRepository {
  readonly sourceWindowId: string;
  private readonly pending = new Map<string, Promise<ModelChange>>();

  constructor(
    private readonly transport: ModelTransport = tauriTransport,
    sourceWindowId = createWindowId(),
  ) {
    this.sourceWindowId = sourceWindowId;
  }

  hydrate(workspaceId?: string): Promise<WorkspaceSnapshot> {
    return this.transport.invoke("workspace_hydrate", {
      workspaceId: workspaceId ?? null,
    });
  }

  settings(): Promise<Settings> {
    return this.transport.invoke("settings_get");
  }

  queueUpsert(model: Model): Promise<ModelChange> {
    const modelId = model.data.id;
    const previous = this.pending.get(modelId);
    const write = (previous ? previous.catch(() => undefined) : Promise.resolve())
      .then(() =>
        this.transport.invoke<ModelChange>("models_upsert", {
          model,
          sourceWindowId: this.sourceWindowId,
        }),
      );
    this.pending.set(modelId, write);
    const cleanup = () => {
      if (this.pending.get(modelId) === write) this.pending.delete(modelId);
    };
    void write.then(cleanup, cleanup);
    return write;
  }

  async delete(
    modelKind: ModelKind,
    modelId: string,
    workspaceId?: string,
  ): Promise<ModelChange> {
    await this.flush({ modelId });
    return this.transport.invoke("models_delete", {
      modelKind,
      modelId,
      workspaceId: workspaceId ?? null,
      sourceWindowId: this.sourceWindowId,
    });
  }

  async duplicate(
    modelKind: ModelKind,
    modelId: string,
    name: string,
  ): Promise<ModelChange> {
    await this.flush({ modelId });
    return this.transport.invoke("models_duplicate", {
      modelKind,
      modelId,
      name,
      sourceWindowId: this.sourceWindowId,
    });
  }

  async flush(options: { modelId?: string } = {}): Promise<void> {
    if (options.modelId) {
      await this.pending.get(options.modelId);
      return;
    }
    await Promise.all(this.pending.values());
  }

  onWrite(handler: (change: ModelChange) => void): Promise<() => void> {
    return this.transport.listen("crono:model-write", handler);
  }
}

export const modelRepository = new ModelRepository();
