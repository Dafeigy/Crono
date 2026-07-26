import { defineStore } from "pinia";
import { ref } from "vue";

export type SplitLayout = "horizontal" | "vertical";

const STORAGE_KEY = "crono:split-layout";
const SIDEBAR_STORAGE_KEY = "crono:sidebar-open";
const HORIZONTAL_SPLIT_STORAGE_KEY = "crono:horizontal-split";
const VERTICAL_SPLIT_STORAGE_KEY = "crono:vertical-split";
const ENVIRONMENT_LIST_WIDTH_STORAGE_KEY = "crono:environment-list-width";

function storedLayout(): SplitLayout {
  return localStorage.getItem(STORAGE_KEY) === "vertical"
    ? "vertical"
    : "horizontal";
}

function storedNumber(key: string, fallback: number, min: number, max: number) {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export const useUiStore = defineStore("ui", () => {
  const splitLayout = ref<SplitLayout>(storedLayout());
  const sidebarOpen = ref(localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "false");
  const horizontalSplit = ref(
    storedNumber(HORIZONTAL_SPLIT_STORAGE_KEY, 58, 30, 75),
  );
  const verticalSplit = ref(
    storedNumber(VERTICAL_SPLIT_STORAGE_KEY, 50, 25, 75),
  );
  const environmentListWidth = ref(
    storedNumber(ENVIRONMENT_LIST_WIDTH_STORAGE_KEY, 240, 190, 380),
  );

  function toggleSplitLayout() {
    splitLayout.value =
      splitLayout.value === "horizontal" ? "vertical" : "horizontal";
    localStorage.setItem(STORAGE_KEY, splitLayout.value);
  }

  function toggleSidebar() {
    setSidebarOpen(!sidebarOpen.value);
  }

  function setSidebarOpen(value: boolean) {
    sidebarOpen.value = value;
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen.value));
  }

  function setRequestSplit(layout: SplitLayout, value: number) {
    const clamped =
      layout === "horizontal"
        ? Math.min(75, Math.max(30, value))
        : Math.min(75, Math.max(25, value));
    if (layout === "horizontal") {
      horizontalSplit.value = clamped;
      localStorage.setItem(HORIZONTAL_SPLIT_STORAGE_KEY, String(clamped));
    } else {
      verticalSplit.value = clamped;
      localStorage.setItem(VERTICAL_SPLIT_STORAGE_KEY, String(clamped));
    }
  }

  function setEnvironmentListWidth(value: number) {
    environmentListWidth.value = Math.min(380, Math.max(190, value));
    localStorage.setItem(
      ENVIRONMENT_LIST_WIDTH_STORAGE_KEY,
      String(environmentListWidth.value),
    );
  }

  return {
    splitLayout,
    sidebarOpen,
    horizontalSplit,
    verticalSplit,
    environmentListWidth,
    toggleSplitLayout,
    toggleSidebar,
    setSidebarOpen,
    setRequestSplit,
    setEnvironmentListWidth,
  };
});
