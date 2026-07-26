# Crono Implementation Status

Last updated: 2026-07-26

## Completed

### Phase 1 — application shell and design system

- npm/Cargo workspaces, Vue 3, Vite, Pinia, Vue Router, Vue Query, and Tauri 2.
- ShadCN Vue-style components and a semantic light/dark theme system.
- Crono, High Contrast, GitHub, Catppuccin, Tokyo Night, and Dracula themes.
- Three-pane desktop shell, resizable collection sidebar, English and Simplified Chinese.
- Frameless Tauri window with in-app minimize, maximize/restore, and close controls.
- Compact Yaak-inspired titlebar with workspace/environment breadcrumbs, current
  request title, split-layout toggle, command dialog, and a single settings entry.
- Persistent sidebar collapse toggle, top-level new-request action, and reserved
  Cookie Jar entry.

### Phase 2 — persistence and model synchronization

- SQLite WAL database with forward-only migrations.
- Settings, Workspace, Folder, Environment, CookieJar, and HttpRequest models.
- Typed Tauri CRUD/hydrate commands and `crono:model-write` sequence protocol.
- Frontend repository, same-model ordered pending writes, `flush()`, and Pinia adapter.
- Persisted Workspace, Folder, Request, and Environment CRUD.
- Workspace switching with flush-before-hydrate and active-environment recovery.
- Collection filtering, root/folder request creation, inline rename, duplication, and
  two-step cascade deletion.
- Double-click rename, focus-dismissed context menus, and latest HTTP status in the
  collection tree.
- Rename drafts flush and leave edit mode before workspace switches or sidebar
  teardown.
- Environment selection, parent inheritance, color, and enabled variable editing.
- Environment editing and command search use in-app dialogs instead of navigation pages.
- Cross-window model/settings application and sequence-gap rehydration.
- Listener disposal at application teardown.

### Phase 3 — HTTP minimum vertical slice

- GET/POST and arbitrary HTTP methods through the Rust `crono-http` crate.
- Query parameters, headers, Text/JSON bodies, and request timeout.
- Environment variables plus `{{$uuid}}` and `{{$timestamp}}` templates.
- Parent environment variables resolve from root to child with child precedence.
- Basic, Bearer with custom prefix, and API Key authentication.
- Explicit task cancellation and terminal closed/cancelled/failed states.
- Streaming response bodies to `responses/<response-id>/body`.
- SQLite response history and timeline migration.
- Tauri send/cancel/body-read/history/timeline commands and progress/state events.
- Status, response headers, formatted JSON/text body, history, and timeline UI.
- Send always flushes the current request model before invoking Rust.

## Verification

- Rust unit tests cover GET, POST JSON, headers, Bearer auth, cancellation, and timeout.
- A vertical integration test covers persisted request → HTTP mock → body file → history/timeline.
- SQLite migration/history tests.
- SQLite reopen persistence, duplication, environment inheritance, and cascade tests.
- Frontend pending-write ordering/failure, duplicate flush, recursive deletion, and
  sequence-gap hydration tests.
- TypeScript typecheck, frontend tests, Vite production build.
- Rust workspace tests, clippy with warnings denied, and rustfmt check.
- Browser QA in dark/light themes with no fresh console warnings or errors.

## Next increment

Phase 4 extends the transport with form-urlencoded, multipart and binary bodies,
CookieJar behavior, redirects, proxy/TLS controls, large-response paging, downloads,
and richer response previews.

- Planned: Environment bulk edit for importing and editing variable sets as text.
