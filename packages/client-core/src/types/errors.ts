export interface AppError {
  code: string;
  params?: Record<string, string | number | boolean>;
  detail?: string;
  retryable: boolean;
}

export function isAppError(value: unknown): value is AppError {
  if (!value || typeof value !== "object") return false;
  const error = value as Partial<AppError>;
  return typeof error.code === "string" && typeof error.retryable === "boolean";
}

