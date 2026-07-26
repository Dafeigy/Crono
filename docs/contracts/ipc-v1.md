# Crono IPC v1

All command names are snake_case. JavaScript arguments and serialized payload fields
are camelCase.

## Model commands

| Command | Arguments | Result |
|---|---|---|
| `settings_get` | none | `Settings` |
| `settings_update` | `settings`, `sourceWindowId` | `ModelChange` |
| `workspace_hydrate` | optional `workspaceId` | `WorkspaceSnapshot` |
| `models_upsert` | `model`, `sourceWindowId` | `ModelChange` |
| `models_delete` | `modelKind`, `modelId`, optional `workspaceId`, `sourceWindowId` | `ModelChange` |
| `models_duplicate` | `modelKind`, `modelId`, `name`, `sourceWindowId` | `ModelChange` |

`models_duplicate` supports Workspace, Folder, Environment, CookieJar, and
HttpRequest. It creates a new typed ID and timestamps while retaining the source
model's owning workspace and content.

Deleting a workspace cascades its models and response history. Deleting a folder
cascades descendant folders and their requests. Each committed command records a
monotonic sequence and emits `crono:model-write`; a sequence gap requires a fresh
`workspace_hydrate`.

## HTTP commands

| Command | Arguments | Result |
|---|---|---|
| `http_send` | `requestId`, optional `environmentId` | `HttpTaskStarted` |
| `http_cancel` | `taskId` | boolean |
| `http_response_body_read` | `responseId`, `offset`, `limit` | `HttpBodyRead` |
| `http_response_history` | `requestId`, optional `limit` | `HttpResponse[]` |
| `http_response_latest` | `workspaceId` | `HttpResponse[]` |
| `http_response_events` | `responseId` | `TimelineEvent[]` |

`http_send` creates and persists an initialized response before returning. Every
started task must eventually emit a terminal `closed`, `cancelled`, or `failed`
state.

Bearer authentication stores both `token` and `prefix`. Missing prefixes from
older persisted requests deserialize as `Bearer`; an empty prefix sends the token
without a scheme. `http_response_latest` returns at most one newest response per
request for collection status indicators.

## HTTP events

| Event | Payload |
|---|---|
| `crono:http-progress` | `HttpProgress` |
| `crono:http-state` | `HttpStateEvent` |

Listeners must return and call their dispose functions.

## Error shape

```ts
interface AppError {
  code: string;
  params?: Record<string, string | number | boolean>;
  detail?: string;
  retryable: boolean;
}
```

Stable Phase 3 codes include `http.invalid_method`, `http.invalid_url`,
`http.timeout`, `http.cancelled`, `http.request_failed`,
`http.body_write_failed`, and `http.body_read_failed`.
