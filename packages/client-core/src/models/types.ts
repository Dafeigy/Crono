export type Appearance = "system" | "light" | "dark";

export interface Settings {
  id: string;
  locale: string;
  appearance: Appearance;
  themeLight: string;
  themeDark: string;
  createdAt: number;
  updatedAt: number;
}

export interface KeyValue {
  id: string;
  enabled: boolean;
  name: string;
  value: string;
}

export interface Workspace {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  sortPriority: number;
  createdAt: number;
  updatedAt: number;
}

export interface Environment {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  color: string | null;
  variables: KeyValue[];
  sortPriority: number;
  createdAt: number;
  updatedAt: number;
}

export interface Cookie {
  id: string;
  name: string;
  value: string;
  domain: string;
  path: string;
  expiresAt: number | null;
  secure: boolean;
  httpOnly: boolean;
}

export interface CookieJar {
  id: string;
  workspaceId: string;
  name: string;
  cookies: Cookie[];
  createdAt: number;
  updatedAt: number;
}

export type RequestBody =
  | { type: "none" }
  | { type: "text"; value: string }
  | { type: "json"; value: string }
  | { type: "form"; value: KeyValue[] };

export type RequestAuth =
  | { type: "none" }
  | { type: "inherit" }
  | { type: "basic"; username: string; password: string }
  | { type: "bearer"; token: string; prefix: string }
  | { type: "api_key"; name: string; value: string; location: string };

export interface HttpRequest {
  id: string;
  workspaceId: string;
  folderId: string | null;
  name: string;
  method: string;
  url: string;
  parameters: KeyValue[];
  headers: KeyValue[];
  body: RequestBody;
  authentication: RequestAuth;
  timeoutMs: number;
  sortPriority: number;
  createdAt: number;
  updatedAt: number;
}

export type HttpResponseState =
  | "initialized"
  | "connecting"
  | "streaming"
  | "closed"
  | "cancelled"
  | "failed";

export interface HttpResponse {
  id: string;
  requestId: string;
  workspaceId: string;
  taskId: string;
  state: HttpResponseState;
  method: string;
  url: string;
  status: number | null;
  statusText: string | null;
  requestHeaders: KeyValue[];
  headers: KeyValue[];
  bodyPath: string | null;
  bodySize: number;
  contentType: string | null;
  elapsedMs: number | null;
  errorCode: string | null;
  errorDetail: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TimelineEvent {
  id: string;
  responseId: string;
  eventType: string;
  title: string;
  detail: string | null;
  timestampMs: number;
}

export interface HttpTaskStarted {
  taskId: string;
  responseId: string;
}

export interface HttpProgress {
  taskId: string;
  responseId: string;
  sentBytes: number;
  receivedBytes: number;
}

export interface HttpStateEvent {
  taskId: string;
  responseId: string;
  state: HttpResponseState;
  response: HttpResponse | null;
}

export interface HttpBodyRead {
  content: string;
  offset: number;
  nextOffset: number;
  eof: boolean;
  isText: boolean;
}

export type ModelKind =
  | "settings"
  | "workspace"
  | "folder"
  | "environment"
  | "cookie_jar"
  | "http_request";

export type Model =
  | { model: "settings"; data: Settings }
  | { model: "workspace"; data: Workspace }
  | { model: "folder"; data: Folder }
  | { model: "environment"; data: Environment }
  | { model: "cookie_jar"; data: CookieJar }
  | { model: "http_request"; data: HttpRequest };

export interface ModelChange {
  sequence: number;
  sourceWindowId: string;
  operation: "upsert" | "delete";
  modelKind: ModelKind;
  modelId: string;
  workspaceId: string | null;
  model: Model | null;
}

export interface WorkspaceSnapshot {
  sequence: number;
  settings: Settings;
  workspaces: Workspace[];
  folders: Folder[];
  environments: Environment[];
  cookieJars: CookieJar[];
  httpRequests: HttpRequest[];
}
