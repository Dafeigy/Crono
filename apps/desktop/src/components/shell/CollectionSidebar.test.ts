// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import { nextTick } from "vue";
import {
  createMemoryHistory,
  createRouter,
  type Router,
} from "vue-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import enUS from "../../i18n/locales/en-US";
import { useModelsStore } from "../../stores/models";
import CollectionSidebar from "./CollectionSidebar.vue";

const i18n = createI18n({
  legacy: false,
  locale: "en-US",
  messages: { "en-US": enUS },
});

let router: Router;

beforeEach(async () => {
  document.body.innerHTML = "";
  setActivePinia(createPinia());
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div />" } }],
  });
  await router.push("/");
  await router.isReady();
  const models = useModelsStore();
  await models.initialize();
  const timestamp = Math.floor(Date.now() / 1000);
  await models.queueModel({
    model: "folder",
    data: {
      id: "folder-test",
      workspaceId: "workspace-personal",
      parentId: null,
      name: "Test folder",
      sortPriority: 1000,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });
  await models.queueModel({
    model: "http_request",
    data: {
      id: "request-test",
      workspaceId: "workspace-personal",
      folderId: "folder-test",
      name: "Test request",
      method: "GET",
      url: "",
      parameters: [],
      headers: [],
      body: { type: "none" },
      authentication: { type: "none" },
      timeoutMs: 30_000,
      sortPriority: 1000,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});

function mountSidebar() {
  return mount(CollectionSidebar, {
    global: { plugins: [i18n, router] },
    attachTo: document.body,
  });
}

describe("CollectionSidebar", () => {
  it("collapses folders and creates a request beside the active request", async () => {
    const models = useModelsStore();
    const activeRequest = models.currentRequest!;
    expect(activeRequest.folderId).toBeTruthy();
    await router.replace({ path: "/", query: { request: activeRequest.id } });

    const wrapper = mountSidebar();
    const folder = wrapper.get(".tree-folder");
    const nestedRequest = wrapper.get(
      `.tree-request-wrap[data-model-id="${activeRequest.id}"]`,
    );

    await folder.trigger("click");
    expect(folder.attributes("aria-expanded")).toBe("false");
    expect(nestedRequest.isVisible()).toBe(false);

    await wrapper.findAll(".sidebar-actions button")[1]!.trigger("click");
    await flushPromises();
    const created = models.httpRequests.find(
      ({ id }) => id === router.currentRoute.value.query.request,
    )!;
    expect(created.id).not.toBe(activeRequest.id);
    expect(created.folderId).toBe(activeRequest.folderId);
    wrapper.unmount();
  });

  it("moves a dragged request into the dropped folder", async () => {
    const models = useModelsStore();
    const source = models.currentRequest!;
    const targetFolder = {
      ...models.folders[0]!,
      id: "folder-target",
      name: "Target folder",
      sortPriority: Date.now() + 1,
    };
    await models.queueModel({ model: "folder", data: targetFolder });
    const targetRequest = {
      ...source,
      id: "request-target",
      folderId: targetFolder.id,
      name: "Target request",
    };
    await models.queueModel({
      model: "http_request",
      data: targetRequest,
    });
    await models.queueModel({
      model: "http_request",
      data: { ...source, folderId: models.folders[0]!.id },
    });

    const wrapper = mountSidebar();
    const request = wrapper.get(
      `.tree-request-wrap[data-model-id="${source.id}"] .tree-request`,
    );
    const folderGroup = wrapper.get(
      `.tree-folder-group[data-folder-id="${targetFolder.id}"]`,
    );
    const targetFolderRequest = folderGroup.get(
      `.tree-request-wrap[data-model-id="${targetRequest.id}"] .tree-request`,
    );

    await request.trigger("pointerdown", {
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    await targetFolderRequest.trigger("pointermove", {
      pointerId: 1,
      clientX: 10,
      clientY: 30,
    });
    expect(folderGroup.classes()).toContain("is-drop-target");
    await targetFolderRequest.trigger("pointerup", {
      pointerId: 1,
      clientX: 10,
      clientY: 30,
    });
    await flushPromises();

    expect(models.httpRequests.find(({ id }) => id === source.id)?.folderId).toBe(
      targetFolder.id,
    );
    wrapper.unmount();
  });

  it("opens deletion confirmation in a modal dialog", async () => {
    const models = useModelsStore();
    const request = models.currentRequest!;
    const wrapper = mountSidebar();

    await wrapper
      .get(`.tree-request-wrap[data-model-id="${request.id}"]`)
      .trigger("contextmenu", { clientX: 20, clientY: 20 });
    const deleteMenuItem = document.querySelector<HTMLButtonElement>(
      ".collection-context-menu .is-danger",
    );
    expect(deleteMenuItem).not.toBeNull();
    deleteMenuItem!.click();
    await nextTick();

    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain(request.name);
    expect(document.querySelector(".collection-context-menu")).toBeNull();
    wrapper.unmount();
  });

  it("focuses and navigates the tree with Vim shortcuts", async () => {
    const wrapper = mountSidebar();
    window.dispatchEvent(new CustomEvent("crono:focus-sidebar-tree"));
    await nextTick();

    const rows = wrapper.findAll<HTMLElement>(".collection-tree .tree-row");
    const activeIndex = rows.findIndex((row) =>
      row.classes().includes("is-active"),
    );
    expect(activeIndex).toBeGreaterThanOrEqual(0);
    expect(document.activeElement).toBe(rows[activeIndex]!.element);

    const nextEvent = new KeyboardEvent("keydown", {
      key: "j",
      bubbles: true,
      cancelable: true,
    });
    rows[activeIndex]!.element.dispatchEvent(nextEvent);
    await nextTick();
    const nextIndex = (activeIndex + 1) % rows.length;
    expect(nextEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(rows[nextIndex]!.element);

    const previousEvent = new KeyboardEvent("keydown", {
      key: "k",
      bubbles: true,
      cancelable: true,
    });
    rows[nextIndex]!.element.dispatchEvent(previousEvent);
    await nextTick();
    expect(previousEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(rows[activeIndex]!.element);
    wrapper.unmount();
  });

  it("renames the current request and confirms with Enter", async () => {
    const models = useModelsStore();
    const request = models.currentRequest!;
    const wrapper = mountSidebar();

    window.dispatchEvent(
      new CustomEvent("crono:rename-model", {
        detail: { id: request.id },
      }),
    );
    await nextTick();

    const input = wrapper.get<HTMLInputElement>(
      `.tree-request-wrap[data-model-id="${request.id}"] input`,
    );
    expect(document.activeElement).toBe(input.element);
    await input.setValue("Renamed request");
    await input.trigger("keydown", { key: "Enter" });
    await flushPromises();

    expect(models.httpRequests.find(({ id }) => id === request.id)?.name).toBe(
      "Renamed request",
    );
    wrapper.unmount();
  });
});
