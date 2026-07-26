import { describe, expect, it } from "vitest";
import { ModelRepository, type ModelTransport } from "./repository";
import type { Model, ModelChange } from "./types";

function settingsModel(locale: string): Model {
  return {
    model: "settings",
    data: {
      id: "settings",
      locale,
      appearance: "system",
      themeLight: "crono-light",
      themeDark: "crono-dark",
      createdAt: 1,
      updatedAt: 1,
    },
  };
}

function folderModel(): Model {
  return {
    model: "folder",
    data: {
      id: "folder",
      workspaceId: "workspace",
      parentId: null,
      name: "Folder",
      sortPriority: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  };
}

describe("ModelRepository", () => {
  it("serializes writes for the same model and flushes the latest one", async () => {
    const calls: string[] = [];
    const transport: ModelTransport = {
      async invoke<T>(_command: string, args?: Record<string, unknown>) {
        const model = args?.model as Extract<Model, { model: "settings" }>;
        calls.push(model.data.locale);
        return {
          sequence: calls.length,
          sourceWindowId: "test",
          operation: "upsert",
          modelKind: "settings",
          modelId: "settings",
          workspaceId: null,
          model,
        } as T;
      },
      async listen() {
        return () => undefined;
      },
    };
    const repository = new ModelRepository(transport, "test");
    void repository.queueUpsert(settingsModel("zh-CN"));
    void repository.queueUpsert(settingsModel("en-US"));
    await repository.flush({ modelId: "settings" });
    expect(calls).toEqual(["zh-CN", "en-US"]);
  });

  it("returns a disposer from model-write subscriptions", async () => {
    let disposed = false;
    const transport: ModelTransport = {
      async invoke<T>() {
        return {} as T;
      },
      async listen<T>(_event: string, _handler: (payload: T) => void) {
        return () => {
          disposed = true;
        };
      },
    };
    const repository = new ModelRepository(transport, "test");
    const dispose = await repository.onWrite((_change: ModelChange) => undefined);
    dispose();
    expect(disposed).toBe(true);
  });

  it("flushes the source model before requesting a duplicate", async () => {
    const commands: string[] = [];
    const transport: ModelTransport = {
      async invoke<T>(command: string, args?: Record<string, unknown>) {
        commands.push(command);
        if (command === "models_upsert") {
          const model = args?.model as Model;
          return {
            sequence: 1,
            sourceWindowId: "test",
            operation: "upsert",
            modelKind: model.model,
            modelId: model.data.id,
            workspaceId: null,
            model,
          } as T;
        }
        expect(args).toMatchObject({
          modelKind: "folder",
          modelId: "folder",
          name: "Folder copy",
          sourceWindowId: "test",
        });
        return {
          sequence: 2,
          sourceWindowId: "test",
          operation: "upsert",
          modelKind: "folder",
          modelId: "folder-copy",
          workspaceId: "workspace",
          model: null,
        } as T;
      },
      async listen() {
        return () => undefined;
      },
    };
    const repository = new ModelRepository(transport, "test");
    void repository.queueUpsert(folderModel());
    await repository.duplicate("folder", "folder", "Folder copy");
    expect(commands).toEqual(["models_upsert", "models_duplicate"]);
  });

  it("rejects flush when a pending write fails", async () => {
    const transport: ModelTransport = {
      async invoke<T>() {
        throw {
          code: "database.operation_failed",
          retryable: true,
        };
      },
      async listen() {
        return () => undefined;
      },
    };
    const repository = new ModelRepository(transport, "test");
    void repository.queueUpsert(settingsModel("zh-CN")).catch(() => undefined);
    await expect(repository.flush({ modelId: "settings" })).rejects.toMatchObject({
      code: "database.operation_failed",
    });
  });
});
