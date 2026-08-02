<script setup lang="ts">
import { Braces, Check, ChevronDown, Copy, X } from "lucide-vue-next";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useI18n } from "vue-i18n";
import {
  parseStreamingResponse,
  STREAM_EXTRACTION_PRESETS,
  type StreamEvent,
  type StreamExtractionPresetId,
} from "../../features/requests/streamingResponse";
import ResponseCodeViewer from "./ResponseCodeViewer.vue";
import type { JsonPathContextPayload } from "./ResponseCodeViewer.vue";

const props = defineProps<{
  body: string;
  contentType?: string | null;
  isLive: boolean;
  responseId: string;
}>();

const { t } = useI18n();
const viewMode = ref<"full" | "jsonpath">("full");
const viewMenuOpen = ref(false);
const presetMenuOpen = ref(false);
const viewMenuRoot = ref<HTMLElement>();
const presetMenuRoot = ref<HTMLElement>();
const jsonPathContextMenuRoot = ref<HTMLElement>();
const jsonPathContextMenu = ref<
  { path: string; left: number; top: number } | undefined
>();
const selectedPreset = ref<StreamExtractionPresetId>(
  STREAM_EXTRACTION_PRESETS[0].id,
);
const jsonPath = ref<string>(STREAM_EXTRACTION_PRESETS[0].path);
const selectedEventIndex = ref<number | null>(null);
const inspectorElement = ref<HTMLElement>();
const eventListElement = ref<HTMLElement>();
const followTail = ref(true);
const copyFeedback = ref(false);
let copyFeedbackTimer: ReturnType<typeof setTimeout> | undefined;
type StreamPanel = "events" | "detail" | "extracted";
const PANEL_SIZE_STORAGE_KEY = "crono:stream-panel-sizes";
const PANEL_HANDLE_SIZE = 9;
const defaultPanelRatios: Record<StreamPanel, number> = {
  events: 0.48,
  detail: 0.3,
  extracted: 0.22,
};
function storedPanelRatios() {
  try {
    const stored = JSON.parse(
      localStorage.getItem(PANEL_SIZE_STORAGE_KEY) ?? "{}",
    ) as Partial<Record<StreamPanel, number>>;
    return Object.fromEntries(
      Object.entries(defaultPanelRatios).map(([key, fallback]) => {
        const value = stored[key as StreamPanel];
        return [key, typeof value === "number" && value > 0 ? value : fallback];
      }),
    ) as Record<StreamPanel, number>;
  } catch {
    return { ...defaultPanelRatios };
  }
}
const panelRatios = ref(storedPanelRatios());
interface PanelResizeState {
  before: StreamPanel;
  after: StreamPanel;
  startY: number;
  beforeRatio: number;
  afterRatio: number;
  availableHeight: number;
  activeRatioTotal: number;
}
let panelResize: PanelResizeState | undefined;

const parsed = computed(() =>
  parseStreamingResponse(
    props.body,
    props.contentType,
    jsonPath.value,
    !props.isLive,
  ),
);
const selectedEvent = computed(() =>
  selectedEventIndex.value === null
    ? null
    : (parsed.value.events[selectedEventIndex.value] ?? null),
);
const selectedEventContent = computed(() => {
  const event = selectedEvent.value;
  if (!event) return "";
  return event.value === null ? event.data : JSON.stringify(event.value, null, 2);
});
const selectedEventLanguage = computed<"json" | "text">(() =>
  selectedEvent.value?.value === null ? "text" : "json",
);
const selectedViewLabel = computed(() =>
  viewMode.value === "full" ? t("response.fullEvents") : "JSONPath",
);
const streamViewOptions = computed(() => [
  { value: "full" as const, label: t("response.fullEvents") },
  { value: "jsonpath" as const, label: "JSONPath" },
]);
const selectedPresetLabel = computed(
  () =>
    STREAM_EXTRACTION_PRESETS.find(({ id }) => id === selectedPreset.value)
      ?.label ?? t("response.customJsonPath"),
);
const activePanels = computed<StreamPanel[]>(() => {
  const panels: StreamPanel[] = ["events"];
  if (selectedEvent.value) panels.push("detail");
  if (viewMode.value === "jsonpath") panels.push("extracted");
  return panels;
});
const streamGridStyle = computed(() => {
  const rows = ["auto"];
  activePanels.value.forEach((panel, index) => {
    rows.push(`minmax(64px, ${panelRatios.value[panel] * 100}fr)`);
    if (index < activePanels.value.length - 1) {
      rows.push(`${PANEL_HANDLE_SIZE}px`);
    }
  });
  return { gridTemplateRows: rows.join(" ") };
});

function selectPreset() {
  const preset = STREAM_EXTRACTION_PRESETS.find(
    ({ id }) => id === selectedPreset.value,
  );
  if (preset) jsonPath.value = preset.path;
}

function setViewMode(mode: "full" | "jsonpath") {
  viewMode.value = mode;
  viewMenuOpen.value = false;
}

function setPreset(presetId: StreamExtractionPresetId) {
  selectedPreset.value = presetId;
  selectPreset();
  presetMenuOpen.value = false;
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node;
  if (!viewMenuRoot.value?.contains(target)) viewMenuOpen.value = false;
  if (!presetMenuRoot.value?.contains(target)) presetMenuOpen.value = false;
  if (!jsonPathContextMenuRoot.value?.contains(target)) {
    jsonPathContextMenu.value = undefined;
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  viewMenuOpen.value = false;
  presetMenuOpen.value = false;
  jsonPathContextMenu.value = undefined;
}

async function openJsonPathContextMenu(payload: JsonPathContextPayload) {
  const inspector = inspectorElement.value;
  if (!inspector) return;
  const bounds = inspector.getBoundingClientRect();
  jsonPathContextMenu.value = {
    path: payload.path,
    left: Math.max(8, payload.clientX - bounds.left),
    top: Math.max(8, payload.clientY - bounds.top),
  };
  viewMenuOpen.value = false;
  presetMenuOpen.value = false;
  await nextTick();

  const menu = jsonPathContextMenuRoot.value;
  if (!menu || !jsonPathContextMenu.value) return;
  jsonPathContextMenu.value = {
    ...jsonPathContextMenu.value,
    left: Math.max(
      8,
      Math.min(
        jsonPathContextMenu.value.left,
        bounds.width - menu.offsetWidth - 8,
      ),
    ),
    top: Math.max(
      8,
      Math.min(jsonPathContextMenu.value.top, bounds.height - menu.offsetHeight - 8),
    ),
  };
  menu.querySelector<HTMLButtonElement>("button")?.focus();
}

function useContextJsonPath() {
  const path = jsonPathContextMenu.value?.path;
  if (!path) return;
  jsonPath.value = path;
  selectedPreset.value = "custom";
  viewMode.value = "jsonpath";
  jsonPathContextMenu.value = undefined;
}

function updateJsonPath(event: Event) {
  jsonPath.value = (event.target as HTMLInputElement).value;
  const matchingPreset = STREAM_EXTRACTION_PRESETS.find(
    ({ path }) => path === jsonPath.value,
  );
  selectedPreset.value = matchingPreset?.id ?? "custom";
}

function selectEvent(event: StreamEvent) {
  selectedEventIndex.value = event.index;
}

function onEventListScroll() {
  const element = eventListElement.value;
  if (!element) return;
  followTail.value =
    element.scrollHeight - element.scrollTop - element.clientHeight < 24;
}

async function scrollToLatest() {
  followTail.value = true;
  await nextTick();
  const element = eventListElement.value;
  if (element) element.scrollTop = element.scrollHeight;
}

async function copyExtractedText() {
  if (!parsed.value.content) return;
  try {
    await navigator.clipboard.writeText(parsed.value.content);
    copyFeedback.value = true;
    clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = setTimeout(() => {
      copyFeedback.value = false;
    }, 1800);
  } catch {
    copyFeedback.value = false;
  }
}

function savePanelRatios() {
  localStorage.setItem(PANEL_SIZE_STORAGE_KEY, JSON.stringify(panelRatios.value));
}

function applyPanelResize(beforeRatio: number, afterRatio: number) {
  if (!panelResize) return;
  const pairTotal = panelResize.beforeRatio + panelResize.afterRatio;
  const activeRatioTotal = panelResize.activeRatioTotal;
  const minRatio = Math.min(
    pairTotal / 2,
    (64 / panelResize.availableHeight) * activeRatioTotal,
  );
  panelRatios.value = {
    ...panelRatios.value,
    [panelResize.before]: Math.max(
      minRatio,
      Math.min(pairTotal - minRatio, beforeRatio),
    ),
    [panelResize.after]: Math.max(
      minRatio,
      Math.min(pairTotal - minRatio, afterRatio),
    ),
  };
}

function onPanelResizeMove(event: PointerEvent) {
  if (!panelResize) return;
  const deltaRatio =
    ((event.clientY - panelResize.startY) / panelResize.availableHeight) *
    panelResize.activeRatioTotal;
  applyPanelResize(
    panelResize.beforeRatio + deltaRatio,
    panelResize.afterRatio - deltaRatio,
  );
}

function stopPanelResize() {
  if (!panelResize) return;
  panelResize = undefined;
  document.body.classList.remove("is-resizing-stream-panel");
  window.removeEventListener("pointermove", onPanelResizeMove);
  window.removeEventListener("pointerup", stopPanelResize);
  savePanelRatios();
}

function startPanelResize(
  event: PointerEvent,
  before: StreamPanel,
  after: StreamPanel,
) {
  const element = inspectorElement.value;
  if (!element) return;
  const controlsHeight =
    element.querySelector<HTMLElement>(".stream-inspector-controls")
      ?.offsetHeight ?? 0;
  const availableHeight = Math.max(
    128,
    element.clientHeight -
      controlsHeight -
      (activePanels.value.length - 1) * PANEL_HANDLE_SIZE,
  );
  panelResize = {
    before,
    after,
    startY: event.clientY,
    beforeRatio: panelRatios.value[before],
    afterRatio: panelRatios.value[after],
    availableHeight,
    activeRatioTotal: activePanels.value.reduce(
      (total, panel) => total + panelRatios.value[panel],
      0,
    ),
  };
  document.body.classList.add("is-resizing-stream-panel");
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  window.addEventListener("pointermove", onPanelResizeMove);
  window.addEventListener("pointerup", stopPanelResize);
}

function resizePanelsWithKeyboard(
  event: KeyboardEvent,
  before: StreamPanel,
  after: StreamPanel,
) {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  const pairTotal = panelRatios.value[before] + panelRatios.value[after];
  const step = pairTotal * 0.04 * (event.key === "ArrowUp" ? -1 : 1);
  panelResize = {
    before,
    after,
    startY: 0,
    beforeRatio: panelRatios.value[before],
    afterRatio: panelRatios.value[after],
    availableHeight: Math.max(128, inspectorElement.value?.clientHeight ?? 128),
    activeRatioTotal: activePanels.value.reduce(
      (total, panel) => total + panelRatios.value[panel],
      0,
    ),
  };
  applyPanelResize(
    panelRatios.value[before] + step,
    panelRatios.value[after] - step,
  );
  panelResize = undefined;
  savePanelRatios();
}

function panelSizePercent(before: StreamPanel, after: StreamPanel) {
  return Math.round(
    (panelRatios.value[before] /
      (panelRatios.value[before] + panelRatios.value[after])) *
      100,
  );
}

watch(
  () => parsed.value.events.length,
  async () => {
    if (followTail.value) await scrollToLatest();
  },
);

watch(
  () => props.responseId,
  () => {
    selectedEventIndex.value = null;
    followTail.value = true;
    jsonPathContextMenu.value = undefined;
  },
);

onBeforeUnmount(() => {
  clearTimeout(copyFeedbackTimer);
  stopPanelResize();
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeydown);
});

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeydown);
});
</script>

<template>
  <div
    ref="inspectorElement"
    class="stream-inspector"
    :class="{
      'is-jsonpath': viewMode === 'jsonpath',
      'has-detail': selectedEvent,
    }"
    :style="streamGridStyle"
  >
    <div class="stream-inspector-controls">
      <div
        ref="viewMenuRoot"
        class="stream-select-root stream-view-select"
      >
        <button
          type="button"
          class="stream-select-trigger"
          aria-haspopup="menu"
          :aria-expanded="viewMenuOpen"
          :aria-label="t('response.streamView')"
          @click="
            viewMenuOpen = !viewMenuOpen;
            presetMenuOpen = false;
          "
        >
          <span>{{ selectedViewLabel }}</span>
          <ChevronDown :size="12" aria-hidden="true" />
        </button>
        <div
          v-if="viewMenuOpen"
          class="response-action-menu stream-select-menu"
          role="menu"
        >
          <button
            v-for="option in streamViewOptions"
            :key="option.value"
            type="button"
            role="menuitemradio"
            :aria-checked="viewMode === option.value"
            @click="setViewMode(option.value)"
          >
            <Check
              :class="{ 'is-hidden': viewMode !== option.value }"
              :size="13"
              aria-hidden="true"
            />
            <span>{{ option.label }}</span>
          </button>
        </div>
      </div>
      <template v-if="viewMode === 'jsonpath'">
        <div
          ref="presetMenuRoot"
          class="stream-select-root stream-preset-select"
        >
          <button
            type="button"
            class="stream-select-trigger"
            aria-haspopup="menu"
            :aria-expanded="presetMenuOpen"
            :aria-label="t('response.extractionFormat')"
            :title="selectedPresetLabel"
            @click="
              presetMenuOpen = !presetMenuOpen;
              viewMenuOpen = false;
            "
          >
            <span>{{ selectedPresetLabel }}</span>
            <ChevronDown :size="12" aria-hidden="true" />
          </button>
          <div
            v-if="presetMenuOpen"
            class="response-action-menu stream-select-menu"
            role="menu"
          >
            <button
              v-for="preset in STREAM_EXTRACTION_PRESETS"
              :key="preset.id"
              type="button"
              role="menuitemradio"
              :aria-checked="selectedPreset === preset.id"
              :title="preset.label"
              @click="setPreset(preset.id)"
            >
              <Check
                :class="{ 'is-hidden': selectedPreset !== preset.id }"
                :size="13"
                aria-hidden="true"
              />
              <span>{{ preset.label }}</span>
            </button>
            <button
              type="button"
              role="menuitemradio"
              :aria-checked="selectedPreset === 'custom'"
              @click="setPreset('custom')"
            >
              <Check
                :class="{ 'is-hidden': selectedPreset !== 'custom' }"
                :size="13"
                aria-hidden="true"
              />
              <span>{{ t("response.customJsonPath") }}</span>
            </button>
          </div>
        </div>
        <label class="stream-jsonpath-input">
          <span class="sr-only">JSONPath</span>
          <input
            :value="jsonPath"
            aria-label="JSONPath"
            spellcheck="false"
            @input="updateJsonPath"
          />
        </label>
      </template>
      <span class="stream-event-count" role="status">
        <span v-if="isLive" class="stream-live-dot" aria-hidden="true" />
        {{ t("response.streamEvents", { count: parsed.eventCount }) }}
      </span>
    </div>

    <div
      ref="eventListElement"
      class="stream-event-list"
      role="listbox"
      :aria-label="t('response.fullEvents')"
      @scroll="onEventListScroll"
    >
      <button
        v-for="event in parsed.events"
        :key="event.index"
        type="button"
        role="option"
        :aria-selected="selectedEventIndex === event.index"
        :class="{ 'is-active': selectedEventIndex === event.index }"
        @click="selectEvent(event)"
      >
        <ChevronDown :size="13" aria-hidden="true" />
        <span class="stream-event-index">{{ event.index + 1 }}</span>
        <span class="stream-event-type">{{ event.eventType }}</span>
        <code>{{ event.summary }}</code>
      </button>
      <p v-if="!parsed.events.length" class="stream-event-empty">
        {{ t(isLive ? "response.waitingForEvents" : "response.noStreamEvents") }}
      </p>
      <button
        v-if="!followTail"
        type="button"
        class="stream-follow-button"
        :aria-label="t('response.jumpToLatestEvent')"
        :title="t('response.jumpToLatestEvent')"
        @click="scrollToLatest"
      >
        <ChevronDown :size="15" aria-hidden="true" />
      </button>
    </div>

    <div
      v-if="selectedEvent || viewMode === 'jsonpath'"
      class="stream-panel-resize-handle"
      role="separator"
      aria-orientation="horizontal"
      :aria-label="t('response.resizePanels')"
      :aria-valuenow="
        panelSizePercent('events', selectedEvent ? 'detail' : 'extracted')
      "
      aria-valuemin="10"
      aria-valuemax="90"
      tabindex="0"
      @pointerdown.prevent="
        startPanelResize(
          $event,
          'events',
          selectedEvent ? 'detail' : 'extracted',
        )
      "
      @keydown="
        resizePanelsWithKeyboard(
          $event,
          'events',
          selectedEvent ? 'detail' : 'extracted',
        )
      "
    />

    <section v-if="selectedEvent" class="stream-event-detail">
      <header>
        <span class="stream-event-index">{{ selectedEvent.index + 1 }}</span>
        <span class="stream-event-type">{{ selectedEvent.eventType }}</span>
        <strong>{{ t("response.eventDetail") }}</strong>
        <button
          type="button"
          :aria-label="t('response.closeEventDetail')"
          :title="t('response.closeEventDetail')"
          @click="selectedEventIndex = null"
        >
          <X :size="14" aria-hidden="true" />
        </button>
      </header>
      <ResponseCodeViewer
        :content="selectedEventContent"
        :language="selectedEventLanguage"
        :enable-json-path-context="selectedEventLanguage === 'json'"
        @json-path-context="openJsonPathContextMenu"
      />
    </section>

    <div
      v-if="selectedEvent && viewMode === 'jsonpath'"
      class="stream-panel-resize-handle"
      role="separator"
      aria-orientation="horizontal"
      :aria-label="t('response.resizePanels')"
      :aria-valuenow="panelSizePercent('detail', 'extracted')"
      aria-valuemin="10"
      aria-valuemax="90"
      tabindex="0"
      @pointerdown.prevent="startPanelResize($event, 'detail', 'extracted')"
      @keydown="resizePanelsWithKeyboard($event, 'detail', 'extracted')"
    />

    <section v-if="viewMode === 'jsonpath'" class="stream-extracted-text">
      <header>
        <strong>{{ t("response.extractedText") }}</strong>
        <code :class="{ 'is-error': parsed.pathError }">{{ jsonPath }}</code>
        <button
          type="button"
          :disabled="!parsed.content"
          :aria-label="t('response.copyExtractedText')"
          :title="t('response.copyExtractedText')"
          @click="copyExtractedText"
        >
          <Check v-if="copyFeedback" :size="14" aria-hidden="true" />
          <Copy v-else :size="14" aria-hidden="true" />
        </button>
      </header>
      <p v-if="parsed.pathError" class="stream-path-error">
        {{ t("response.invalidJsonPath") }}
      </p>
      <pre v-else-if="parsed.content">{{ parsed.content }}</pre>
      <p v-else class="stream-extracted-empty">
        {{ t("response.noExtractedText") }}
      </p>
    </section>

    <div
      v-if="jsonPathContextMenu"
      ref="jsonPathContextMenuRoot"
      class="response-action-menu stream-jsonpath-context-menu"
      role="menu"
      :aria-label="t('response.jsonPathContextMenu')"
      :style="{
        left: `${jsonPathContextMenu.left}px`,
        top: `${jsonPathContextMenu.top}px`,
      }"
    >
      <code :title="jsonPathContextMenu.path">{{ jsonPathContextMenu.path }}</code>
      <button type="button" role="menuitem" @click="useContextJsonPath">
        <Braces :size="14" aria-hidden="true" />
        <span>{{ t("response.useAsJsonPath") }}</span>
      </button>
    </div>
  </div>
</template>
