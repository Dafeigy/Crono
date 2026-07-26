import { invoke } from "@tauri-apps/api/core";
import { isAppError, type AppError } from "../types/errors";

export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (isAppError(error)) throw error;
    const fallback: AppError = {
      code: "app.unexpected",
      detail: error instanceof Error ? error.message : String(error),
      retryable: false,
    };
    throw fallback;
  }
}

