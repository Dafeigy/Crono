<script setup lang="ts">
import type {
  Environment,
  HttpRequest,
  KeyValue,
  RequestAuth,
  RequestBody,
} from "@crono/client-core";
import { Badge, Button } from "@crono/ui";
import {
  Braces,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  FilePlus2,
  FolderPlus,
  Plus,
  Send,
  Square,
  X,
} from "lucide-vue-next";
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import TemplateVariableInput, {
  type TemplateVariableOption,
} from "../../../components/request/TemplateVariableInput.vue";
import { useHttpStore } from "../../../stores/http";
import { useModelsStore } from "../../../stores/models";
import { shortcutLabel } from "../../../shortcuts";
import { useUiStore } from "../../../stores/ui";

const ResponseCodeViewer = defineAsyncComponent(
  () => import("../../../components/response/ResponseCodeViewer.vue"),
);

const { t } = useI18n();
const route = useRoute();
const models = useModelsStore();
const http = useHttpStore();
const ui = useUiStore();
void http.initialize();

const draft = ref<HttpRequest>();
const requestTab = ref("params");
const responseTab = ref("response");
const primaryRequestTabs = ["params", "headers", "body"] as const;
const responseTabs = ["request", "headers", "history", "timeline"] as const;
const requestMethods = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;
const methodMenuOpen = ref(false);
const methodMenuRoot = ref<HTMLElement>();
const authMenuOpen = ref(false);
const authMenuRoot = ref<HTMLElement>();
const responseMenuOpen = ref(false);
const responseMenuRoot = ref<HTMLElement>();
const responseMode = ref<"formatted" | "raw">("formatted");
const actionFeedback = ref("");
const workspaceElement = ref<HTMLElement>();
const templateVariables = computed<TemplateVariableOption[]>(() => {
  const activeEnvironment = models.currentEnvironment;
  const variables = new Map<string, TemplateVariableOption>();
  if (activeEnvironment) {
    const inheritanceChain = [];
    const visited = new Set<string>();
    let environment: Environment | undefined = activeEnvironment;
    while (environment && !visited.has(environment.id)) {
      visited.add(environment.id);
      inheritanceChain.push(environment);
      environment = environment.parentId
        ? models.environments.find(({ id }) => id === environment?.parentId)
        : undefined;
    }
    inheritanceChain.reverse();
    for (const source of inheritanceChain) {
      for (const variable of source.variables) {
        if (!variable.enabled || !variable.name.trim()) continue;
        variables.set(variable.name, {
          name: variable.name,
          source: source.name,
          inherited: source.id !== activeEnvironment.id,
        });
      }
    }
  }
  variables.set("$uuid", {
    name: "$uuid",
    source: "Crono",
    builtIn: true,
  });
  variables.set("$timestamp", {
    name: "$timestamp",
    source: "Crono",
    builtIn: true,
  });
  return [...variables.values()];
});
const selectedRequest = computed(
  () =>
    models.httpRequests.find(({ id }) => id === route.query.request) ??
    models.currentRequest,
);
const formattedBody = computed(() => {
  const content = http.body;
  if (!content || !http.activeResponse?.contentType?.includes("json")) return content;
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
});
const displayedBody = computed(() =>
  responseMode.value === "formatted" ? formattedBody.value : http.body,
);
const responseLanguage = computed<"json" | "text">(() =>
  http.activeResponse?.contentType?.includes("json") ? "json" : "text",
);
const requestHeaders = computed(() => {
  if (!draft.value) return [];
  const entries = draft.value.headers
    .filter(({ enabled, name }) => enabled && name.trim())
    .map(({ id, name, value }) => ({ id, name, value }));
  const auth = draft.value.authentication;
  if (auth.type === "bearer" && auth.token) {
    entries.push({
      id: "crono-auth",
      name: "Authorization",
      value: `${auth.prefix.trim() || "Bearer"} ${auth.token}`,
    });
  } else if (auth.type === "basic" && (auth.username || auth.password)) {
    let encoded = `${auth.username}:${auth.password}`;
    try {
      encoded = btoa(encoded);
    } catch {
      // Keep the readable value when credentials cannot be encoded by btoa.
    }
    entries.push({
      id: "crono-auth",
      name: "Authorization",
      value: `Basic ${encoded}`,
    });
  } else if (
    auth.type === "api_key" &&
    auth.location === "header" &&
    auth.name
  ) {
    entries.push({
      id: "crono-auth",
      name: auth.name,
      value: auth.value,
    });
  }
  return entries;
});
const displayedRequestHeaders = computed(() =>
  http.activeResponse?.requestHeaders.length
    ? http.activeResponse.requestHeaders
    : requestHeaders.value,
);
const requestPreview = computed(() => {
  if (!draft.value) return "";
  return JSON.stringify(
    {
      method: draft.value.method,
      url: draft.value.url,
      parameters: draft.value.parameters.filter(({ enabled }) => enabled),
      headers: requestHeaders.value.map(({ name, value }) => ({ name, value })),
      body: draft.value.body,
    },
    null,
    2,
  );
});
const authLabel = computed(() => {
  switch (draft.value?.authentication.type) {
    case "basic":
      return "Basic";
    case "bearer":
      return "Bearer";
    case "api_key":
      return "API Key";
    case "inherit":
      return t("request.authInherit");
    default:
      return t("request.authNone");
  }
});
let loadingRequest = false;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
let resizingSplit = false;
const requestSplit = computed(() =>
  ui.splitLayout === "horizontal" ? ui.horizontalSplit : ui.verticalSplit,
);
const requestSplitStyle = computed(() => ({
  "--request-split": `${requestSplit.value}%`,
}));

function cloneRequest(request: HttpRequest): HttpRequest {
  return JSON.parse(JSON.stringify(request)) as HttpRequest;
}

watch(
  selectedRequest,
  (request) => {
    if (!request) return;
    models.selectRequest(request.id);
    loadingRequest = true;
    draft.value = cloneRequest(request);
    void http.loadHistory(request.id).catch(() => undefined);
    queueMicrotask(() => {
      loadingRequest = false;
    });
  },
  { immediate: true },
);

watch(
  draft,
  () => {
    if (loadingRequest) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistDraft, 250);
  },
  { deep: true },
);

function persistDraft() {
  clearTimeout(persistTimer);
  if (!draft.value) return Promise.resolve();
  return models.queueRequestUpdate({
    ...cloneRequest(draft.value),
    updatedAt: Math.floor(Date.now() / 1000),
  });
}

async function sendRequest() {
  if (!draft.value || !models.persistenceAvailable) return;
  try {
    await persistDraft();
    await models.flushPendingModels();
    await http.send(draft.value.id, models.activeEnvironmentId);
  } catch {
    // The HTTP store exposes the structured, localized error in the editor.
  }
}

function blankKeyValue(): KeyValue {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `field-${Date.now()}`,
    enabled: true,
    name: "",
    value: "",
  };
}

function addKeyValue(target: "parameters" | "headers") {
  draft.value?.[target].push(blankKeyValue());
}

function removeKeyValue(target: "parameters" | "headers", id: string) {
  if (!draft.value) return;
  draft.value[target] = draft.value[target].filter((item) => item.id !== id);
}

function setBodyType(type: RequestBody["type"]) {
  if (!draft.value) return;
  draft.value.body =
    type === "json"
      ? { type, value: "{}" }
      : type === "text"
        ? { type, value: "" }
        : { type: "none" };
}

function setAuthType(type: RequestAuth["type"]) {
  if (!draft.value) return;
  requestTab.value = "auth";
  authMenuOpen.value = false;
  if (draft.value.authentication.type === type) return;
  const authByType: Record<RequestAuth["type"], RequestAuth> = {
    none: { type: "none" },
    inherit: { type: "inherit" },
    basic: { type: "basic", username: "", password: "" },
    bearer: { type: "bearer", token: "", prefix: "Bearer" },
    api_key: { type: "api_key", name: "X-API-Key", value: "", location: "header" },
  };
  draft.value.authentication = authByType[type];
}

function setRequestMethod(method: (typeof requestMethods)[number]) {
  if (draft.value) draft.value.method = method;
  methodMenuOpen.value = false;
}

function onDocumentPointerDown(event: PointerEvent) {
  if (
    methodMenuOpen.value &&
    !methodMenuRoot.value?.contains(event.target as Node)
  ) {
    methodMenuOpen.value = false;
  }
  if (
    authMenuOpen.value &&
    !authMenuRoot.value?.contains(event.target as Node)
  ) {
    authMenuOpen.value = false;
  }
  if (
    responseMenuOpen.value &&
    !responseMenuRoot.value?.contains(event.target as Node)
  ) {
    responseMenuOpen.value = false;
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  methodMenuOpen.value = false;
  authMenuOpen.value = false;
  responseMenuOpen.value = false;
}

function focusRequestUrl() {
  document.querySelector<HTMLInputElement>("#request-url")?.focus();
}

function sendActiveRequest() {
  if (http.isBusy) return;
  void sendRequest();
}

function setResponseMode(mode: "formatted" | "raw") {
  responseMode.value = mode;
  responseTab.value = "response";
  responseMenuOpen.value = false;
}

function showActionFeedback(message: string) {
  actionFeedback.value = message;
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    actionFeedback.value = "";
  }, 1800);
}

async function copyResponseBody() {
  if (!http.activeResponse) return;
  try {
    await navigator.clipboard.writeText(http.body);
    responseMenuOpen.value = false;
    showActionFeedback(t("response.copied"));
  } catch {
    responseMenuOpen.value = false;
    showActionFeedback(t("response.copyFailed"));
  }
}

async function exportResponseBody() {
  if (!http.activeResponse) return;
  const extension = http.activeResponse.contentType?.includes("json")
    ? "json"
    : http.bodyIsText
      ? "txt"
      : "bin";
  const baseName = (selectedRequest.value?.name ?? "response")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .trim();
  const fileName = `${baseName || "response"}-response.${extension}`;
  try {
    if ("__TAURI_INTERNALS__" in window) {
      const [{ invoke }, { save }] = await Promise.all([
        import("@tauri-apps/api/core"),
        import("@tauri-apps/plugin-dialog"),
      ]);
      const destinationPath = await save({
        defaultPath: fileName,
        filters: [
          {
            name: t("response.responseFile"),
            extensions: [extension],
          },
        ],
      });
      if (!destinationPath) return;
      await invoke("http_response_body_export", {
        responseId: http.activeResponse.id,
        destinationPath,
      });
    } else {
      const blob = new Blob([http.body], {
        type: http.activeResponse.contentType ?? "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    responseMenuOpen.value = false;
    showActionFeedback(t("response.exported"));
  } catch {
    responseMenuOpen.value = false;
    showActionFeedback(t("response.exportFailed"));
  }
}

function onSplitPointerMove(event: PointerEvent) {
  if (!resizingSplit || !workspaceElement.value) return;
  const bounds = workspaceElement.value.getBoundingClientRect();
  const value =
    ui.splitLayout === "horizontal"
      ? ((event.clientX - bounds.left) / bounds.width) * 100
      : ((event.clientY - bounds.top) / bounds.height) * 100;
  ui.setRequestSplit(ui.splitLayout, value);
}

function stopSplitResize() {
  resizingSplit = false;
  document.body.classList.remove("is-resizing-split");
  window.removeEventListener("pointermove", onSplitPointerMove);
  window.removeEventListener("pointerup", stopSplitResize);
}

function startSplitResize(event: PointerEvent) {
  resizingSplit = true;
  document.body.classList.add("is-resizing-split");
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  window.addEventListener("pointermove", onSplitPointerMove);
  window.addEventListener("pointerup", stopSplitResize);
}

function onSplitKeydown(event: KeyboardEvent) {
  const decrement =
    ui.splitLayout === "horizontal" ? "ArrowLeft" : "ArrowUp";
  const increment =
    ui.splitLayout === "horizontal" ? "ArrowRight" : "ArrowDown";
  if (event.key !== decrement && event.key !== increment) return;
  event.preventDefault();
  ui.setRequestSplit(
    ui.splitLayout,
    requestSplit.value + (event.key === decrement ? -2 : 2),
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function createFromEmptyState(kind: "request" | "folder") {
  window.dispatchEvent(new CustomEvent(`crono:create-${kind}`));
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeydown);
  window.addEventListener("crono:focus-request-url", focusRequestUrl);
  window.addEventListener("crono:send-request", sendActiveRequest);
});
onBeforeUnmount(() => {
  clearTimeout(persistTimer);
  clearTimeout(feedbackTimer);
  stopSplitResize();
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeydown);
  window.removeEventListener("crono:focus-request-url", focusRequestUrl);
  window.removeEventListener("crono:send-request", sendActiveRequest);
});
</script>

<template>
  <section
    ref="workspaceElement"
    class="request-workspace"
    :class="`layout-${ui.splitLayout}`"
    :style="requestSplitStyle"
  >
    <div v-if="draft" class="request-composer">
      <div class="url-bar">
        <div ref="methodMenuRoot" class="method-menu-root">
          <button
            id="request-method"
            class="method-menu-trigger"
            :class="`method-${draft.method.toLowerCase()}`"
            type="button"
            aria-haspopup="menu"
              :aria-label="`${t('request.method')}: ${draft.method}`"
            :aria-expanded="methodMenuOpen"
            @click="methodMenuOpen = !methodMenuOpen"
          >
            <span>{{ draft.method }}</span>
            <ChevronDown :size="13" aria-hidden="true" />
          </button>
          <div v-if="methodMenuOpen" class="method-menu" role="menu">
            <button
              v-for="method in requestMethods"
              :key="method"
              type="button"
              role="menuitem"
              :class="[
                `method-${method.toLowerCase()}`,
                { 'is-active': draft.method === method },
              ]"
              @click="setRequestMethod(method)"
            >
              <span>{{ method }}</span>
              <Check v-if="draft.method === method" :size="13" />
            </button>
          </div>
        </div>
        <div class="url-input-shell">
          <label class="sr-only" for="request-url">{{ t("request.url") }}</label>
          <TemplateVariableInput
            id="request-url"
            v-model="draft.url"
            class="url-input"
            :variables="templateVariables"
            :placeholder="t('request.queryPlaceholder')"
            :title="`${t('request.url')} (${shortcutLabel('focusRequestUrl')})`"
            @submit="sendRequest"
          />
          <Button
            class="request-send-button"
            :class="{ 'is-cancel': http.isBusy }"
            variant="ghost"
            size="icon"
            type="button"
            :disabled="!http.isBusy && !models.persistenceAvailable"
            :aria-label="t(http.isBusy ? 'request.cancel' : 'request.send')"
            :title="
              http.isBusy
                ? t('request.cancel')
                : `${t('request.send')} (${shortcutLabel('sendRequest')})`
            "
            @click="http.isBusy ? http.cancel() : sendRequest()"
          >
            <Square v-if="http.isBusy" :size="13" />
            <Send v-else :size="15" />
          </Button>
        </div>
      </div>

      <div v-if="http.error" class="foundation-notice request-error" role="alert">
        <span>{{ t(`errors.${http.error.code}`, http.error.code) }}</span>
        <small v-if="http.error.detail">{{ http.error.detail }}</small>
      </div>

      <div class="pane-tabs request-pane-tabs" role="tablist">
        <button
          v-for="tab in primaryRequestTabs"
          :key="tab"
          type="button"
          role="tab"
          :aria-selected="requestTab === tab"
          :class="{ 'is-active': requestTab === tab }"
          @click="requestTab = tab"
        >
          {{ t(`request.${tab}`) }}
          <Badge
            v-if="tab === 'headers' && draft.headers.length"
            tone="neutral"
          >
            {{ draft.headers.filter(({ enabled }) => enabled).length }}
          </Badge>
        </button>
        <div ref="authMenuRoot" class="auth-tab-root">
          <button
            type="button"
            role="tab"
            :aria-selected="requestTab === 'auth'"
            :aria-expanded="authMenuOpen"
            :class="{ 'is-active': requestTab === 'auth' }"
            @click="
              requestTab = 'auth';
              authMenuOpen = !authMenuOpen;
            "
          >
            {{ authLabel }}
            <ChevronDown :size="12" />
          </button>
          <div v-if="authMenuOpen" class="auth-type-menu">
            <button type="button" @click="setAuthType('none')">
              {{ t("request.authNone") }}
            </button>
            <button type="button" @click="setAuthType('inherit')">
              {{ t("request.authInherit") }}
            </button>
            <button type="button" @click="setAuthType('basic')">
              Basic Auth
            </button>
            <button type="button" @click="setAuthType('bearer')">
              Bearer Token
            </button>
            <button type="button" @click="setAuthType('api_key')">
              API Key
            </button>
          </div>
        </div>
        <button
          type="button"
          role="tab"
          :aria-selected="requestTab === 'settings'"
          :class="{ 'is-active': requestTab === 'settings' }"
          @click="requestTab = 'settings'"
        >
          {{ t("request.settings") }}
        </button>
      </div>

      <div class="request-editor">
        <div
          v-if="requestTab === 'params' || requestTab === 'headers'"
          class="key-value-editor"
        >
          <div class="kv-header">
            <span />
            <span>{{ t("request.key") }}</span>
            <span>{{ t("request.value") }}</span>
            <span>{{ t("request.description") }}</span>
            <span />
          </div>
          <div
            v-for="item in requestTab === 'params'
              ? draft.parameters
              : draft.headers"
            :key="item.id"
            class="kv-row"
          >
            <input
              v-model="item.enabled"
              type="checkbox"
              :aria-label="t('request.enabled')"
            />
            <TemplateVariableInput
              v-model="item.name"
              :variables="templateVariables"
              :placeholder="t('request.key')"
            />
            <TemplateVariableInput
              v-model="item.value"
              :variables="templateVariables"
              :placeholder="t('request.value')"
            />
            <input disabled :placeholder="t('request.optional')" />
            <Button
              type="button"
              class="request-config-remove-button"
              variant="ghost"
              size="icon"
              :aria-label="t('request.removeField')"
              @click="
                removeKeyValue(
                  requestTab === 'params' ? 'parameters' : 'headers',
                  item.id,
                )
              "
            >
              <X :size="13" />
            </Button>
          </div>
          <button
            class="add-field-button"
            type="button"
            @click="
              addKeyValue(requestTab === 'params' ? 'parameters' : 'headers')
            "
          >
            <Plus :size="13" />
            {{ t("request.addField") }}
          </button>
        </div>

        <div v-else-if="requestTab === 'body'" class="body-editor">
          <label>
            <span>{{ t("request.bodyType") }}</span>
            <select
              :value="draft.body.type"
              @change="
                setBodyType(
                  ($event.target as HTMLSelectElement).value as RequestBody['type'],
                )
              "
            >
              <option value="none">{{ t("request.bodyNone") }}</option>
              <option value="text">{{ t("request.bodyText") }}</option>
              <option value="json">JSON</option>
            </select>
          </label>
          <textarea
            v-if="draft.body.type === 'text' || draft.body.type === 'json'"
            v-model="draft.body.value"
            spellcheck="false"
          />
          <div v-else class="editor-placeholder">
            <Braces :size="22" />
            <span>{{ t("request.noBody") }}</span>
          </div>
        </div>

        <div v-else-if="requestTab === 'auth'" class="form-editor auth-editor">
          <template v-if="draft.authentication.type === 'basic'">
            <div class="request-form-field">
              <label for="request-auth-username">{{ t("request.username") }}</label>
              <TemplateVariableInput
                id="request-auth-username"
                v-model="draft.authentication.username"
                :variables="templateVariables"
              />
            </div>
            <div class="request-form-field">
              <label for="request-auth-password">{{ t("request.password") }}</label>
              <TemplateVariableInput
                id="request-auth-password"
                v-model="draft.authentication.password"
                :variables="templateVariables"
                masked
              />
            </div>
          </template>
          <template v-else-if="draft.authentication.type === 'bearer'">
            <div class="request-form-field">
              <label for="request-auth-token">{{ t("request.token") }}</label>
              <TemplateVariableInput
                id="request-auth-token"
                v-model="draft.authentication.token"
                :variables="templateVariables"
                masked
              />
            </div>
            <div class="request-form-field">
              <label for="request-auth-prefix">{{ t("request.prefix") }}</label>
              <TemplateVariableInput
                id="request-auth-prefix"
                v-model="draft.authentication.prefix"
                :variables="templateVariables"
              />
            </div>
          </template>
          <template v-else-if="draft.authentication.type === 'api_key'">
            <div class="request-form-field">
              <label for="request-auth-api-key">{{ t("request.key") }}</label>
              <TemplateVariableInput
                id="request-auth-api-key"
                v-model="draft.authentication.name"
                :variables="templateVariables"
              />
            </div>
            <div class="request-form-field">
              <label for="request-auth-api-value">{{ t("request.value") }}</label>
              <TemplateVariableInput
                id="request-auth-api-value"
                v-model="draft.authentication.value"
                :variables="templateVariables"
              />
            </div>
            <div class="request-form-field">
              <label for="request-auth-api-location">{{
                t("request.location")
              }}</label>
              <select
                id="request-auth-api-location"
                v-model="draft.authentication.location"
              >
                <option value="header">Header</option>
                <option value="query">Query</option>
              </select>
            </div>
          </template>
          <div v-else class="auth-empty">
            <span>{{
              draft.authentication.type === "inherit"
                ? t("request.authInheritDescription")
                : t("request.authNoneDescription")
            }}</span>
          </div>
        </div>

        <div v-else class="form-editor">
          <label>
            <span>{{ t("request.timeout") }}</span>
            <input
              v-model.number="draft.timeoutMs"
              type="number"
              min="1"
              max="600000"
            />
          </label>
          <p>{{ t("request.timeoutDescription") }}</p>
        </div>
      </div>
    </div>

    <div v-else class="workspace-empty-state">
      <div class="workspace-empty-mark" aria-hidden="true">
        <FilePlus2 :size="28" stroke-width="1.5" />
      </div>
      <h1>{{ t("workspace.emptyTitle") }}</h1>
      <p>{{ t("workspace.emptyDescription") }}</p>
      <div class="workspace-empty-actions">
        <Button @click="createFromEmptyState('request')">
          <FilePlus2 :size="15" />
          {{ t("workspace.newRequest") }}
        </Button>
        <Button variant="outline" @click="createFromEmptyState('folder')">
          <FolderPlus :size="15" />
          {{ t("workspace.newFolder") }}
        </Button>
      </div>
    </div>

    <div
      class="workspace-split-handle"
      role="separator"
      :aria-orientation="ui.splitLayout === 'horizontal' ? 'vertical' : 'horizontal'"
      :aria-valuenow="Math.round(requestSplit)"
      aria-valuemin="25"
      aria-valuemax="75"
      tabindex="0"
      @pointerdown="startSplitResize"
      @keydown="onSplitKeydown"
    />

    <div class="response-pane">
      <div class="response-summary">
        <div v-if="http.activeResponse" class="response-metadata">
          <strong :class="{ 'is-error': (http.activeResponse.status ?? 0) >= 400 }">
            {{ http.activeResponse.status ?? "—" }}
            {{ http.activeResponse.statusText }}
          </strong>
          <span aria-hidden="true">•</span>
          <span v-if="http.activeResponse.elapsedMs != null">
            {{ http.activeResponse.elapsedMs }} ms
          </span>
          <span aria-hidden="true">•</span>
          <span>{{ formatBytes(http.activeResponse.bodySize) }}</span>
        </div>
        <span v-else class="response-state">
          {{ http.state ? t(`response.states.${http.state}`) : t("response.noResponse") }}
        </span>
        <span v-if="actionFeedback" class="response-action-feedback" role="status">
          <Check :size="12" />{{ actionFeedback }}
        </span>
      </div>

      <div class="response-navigation">
        <div class="pane-tabs response-tabs" role="tablist">
          <div ref="responseMenuRoot" class="response-action-root">
            <button
              type="button"
              role="tab"
              :aria-selected="responseTab === 'response'"
              :aria-expanded="responseMenuOpen"
              aria-haspopup="menu"
              :class="{ 'is-active': responseTab === 'response' }"
              @click="
                responseTab = 'response';
                responseMenuOpen = !responseMenuOpen;
              "
            >
              {{ t("response.title") }}
              <ChevronDown :size="12" />
            </button>
            <div v-if="responseMenuOpen" class="response-action-menu" role="menu">
              <button type="button" role="menuitem" @click="setResponseMode('formatted')">
                <Check :class="{ 'is-hidden': responseMode !== 'formatted' }" :size="13" />
                <span>{{ t("response.formatted") }}</span>
              </button>
              <button type="button" role="menuitem" @click="setResponseMode('raw')">
                <Check :class="{ 'is-hidden': responseMode !== 'raw' }" :size="13" />
                <span>{{ t("response.raw") }}</span>
              </button>
              <div class="response-action-separator" />
              <button
                type="button"
                role="menuitem"
                :disabled="!http.activeResponse"
                @click="exportResponseBody"
              >
                <Download :size="13" />
                <span>{{ t("response.saveToFile") }}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                :disabled="!http.activeResponse || !http.bodyIsText"
                @click="copyResponseBody"
              >
                <Copy :size="13" />
                <span>{{ t("response.copyBody") }}</span>
              </button>
            </div>
          </div>
          <button
            v-for="tab in responseTabs"
            :key="tab"
            type="button"
            role="tab"
            :aria-selected="responseTab === tab"
            :class="{ 'is-active': responseTab === tab }"
            @click="
              responseTab = tab;
              responseMenuOpen = false;
            "
          >
            <Clock3 v-if="tab === 'history'" :size="13" />
            {{ t(`response.${tab}`) }}
            <Badge v-if="tab === 'headers'" tone="neutral">
              {{ displayedRequestHeaders.length + (http.activeResponse?.headers.length ?? 0) }}
            </Badge>
            <Badge v-if="tab === 'history' && http.history.length" tone="neutral">
              {{ http.history.length }}
            </Badge>
          </button>
        </div>
        <div v-if="http.activeResponse" class="response-metadata-legacy">
          <strong :class="{ 'is-error': (http.activeResponse.status ?? 0) >= 400 }">
            {{ http.activeResponse.status ?? "—" }}
            {{ http.activeResponse.statusText }}
          </strong>
          <span v-if="http.activeResponse.elapsedMs != null">
            {{ http.activeResponse.elapsedMs }} ms
          </span>
          <span>{{ formatBytes(http.activeResponse.bodySize) }}</span>
        </div>
        <span v-else class="response-state-legacy">
          {{ http.state ? t(`response.states.${http.state}`) : t("response.noResponse") }}
        </span>
      </div>

      <div v-if="http.isBusy" class="response-loading" role="status">
        <span class="response-spinner" />
        <strong>{{ t(`response.states.${http.state}`) }}</strong>
        <small v-if="http.progress">
          {{ formatBytes(http.progress.receivedBytes) }}
        </small>
      </div>

      <div
        v-else-if="responseTab === 'response' && http.activeResponse"
        class="response-viewer"
      >
        <ResponseCodeViewer
          v-if="http.bodyIsText"
          :content="displayedBody"
          :language="responseLanguage"
        />
        <div v-else class="response-empty">
          <Braces :size="24" />
          <strong>{{ t("response.binaryBody") }}</strong>
          <p>{{ t("response.binaryBodyDescription") }}</p>
        </div>
      </div>

      <div
        v-else-if="responseTab === 'request' && draft"
        class="response-request-view"
      >
        <ResponseCodeViewer :content="requestPreview" language="json" />
      </div>

      <div
        v-else-if="responseTab === 'headers'"
        class="response-headers-view"
      >
        <section class="response-header-section">
          <header>
            <span>{{ t("response.requestHeaders") }}</span>
            <Badge tone="neutral">{{ displayedRequestHeaders.length }}</Badge>
          </header>
          <div v-if="displayedRequestHeaders.length" class="response-header-table">
            <div v-for="header in displayedRequestHeaders" :key="header.id">
              <span>{{ header.name }}</span>
              <span>{{ header.value }}</span>
            </div>
          </div>
          <p v-else>{{ t("response.noHeaders") }}</p>
        </section>
        <section class="response-header-section">
          <header>
            <span>{{ t("response.responseHeaders") }}</span>
            <Badge tone="neutral">{{ http.activeResponse?.headers.length ?? 0 }}</Badge>
          </header>
          <div
            v-if="http.activeResponse?.headers.length"
            class="response-header-table"
          >
            <div
              v-for="header in http.activeResponse?.headers ?? []"
              :key="header.id"
            >
              <span>{{ header.name }}</span>
              <span>{{ header.value }}</span>
            </div>
          </div>
          <p v-else>{{ t("response.noHeaders") }}</p>
        </section>
      </div>

      <div v-else-if="responseTab === 'history'" class="history-list">
        <button
          v-for="item in http.history"
          :key="item.id"
          type="button"
          :class="{ 'is-active': item.id === http.activeResponse?.id }"
          @click="http.loadResponse(item)"
        >
          <span class="method-label" :class="`method-${item.method.toLowerCase()}`">
            {{ item.method }}
          </span>
          <strong>{{ item.status ?? t(`response.states.${item.state}`) }}</strong>
          <span>{{ formatBytes(item.bodySize) }}</span>
          <time>{{ new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "medium" }).format(item.createdAt * 1000) }}</time>
        </button>
      </div>

      <div v-else-if="responseTab === 'timeline'" class="timeline-list">
        <div v-for="event in http.timeline" :key="event.id">
          <span class="timeline-dot" />
          <strong>{{ event.title }}</strong>
          <small>{{ event.timestampMs }} ms</small>
          <p v-if="event.detail">{{ event.detail }}</p>
        </div>
      </div>

      <div v-else class="response-empty">
        <div class="response-empty-icon">
          <Braces :size="24" stroke-width="1.5" />
        </div>
        <strong>{{ t("response.emptyTitle") }}</strong>
        <p>{{ t("response.emptyDescription") }}</p>
      </div>
    </div>
  </section>
</template>
