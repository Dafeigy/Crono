// @vitest-environment jsdom

import type { HttpRequest } from "@crono/client-core";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import {
  createMemoryHistory,
  createRouter,
  type Router,
} from "vue-router";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import enUS from "../../i18n/locales/en-US";
import { useModelsStore } from "../../stores/models";
import { useUiStore } from "../../stores/ui";
import CommandDialog from "./CommandDialog.vue";

const i18n = createI18n({
  legacy: false,
  locale: "en-US",
  messages: { "en-US": enUS },
});

let router: Router;

function makeRequest(id: string, name: string, method: string): HttpRequest {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    id,
    workspaceId: "workspace-personal",
    folderId: null,
    name,
    method,
    url: "https://example.com",
    parameters: [],
    headers: [],
    body: { type: "none" },
    authentication: { type: "none" },
    timeoutMs: 30_000,
    sortPriority: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

beforeEach(async () => {
  localStorage.clear();
  setActivePinia(createPinia());
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div />" } }],
  });
  await router.push("/");
  await router.isReady();

  const models = useModelsStore();
  await models.initialize();
  await models.queueModel({
    model: "http_request",
    data: makeRequest("request-one", "List users", "GET"),
  });
  await models.queueModel({
    model: "http_request",
    data: makeRequest("request-two", "Create user", "POST"),
  });
  await models.queueModel({
    model: "workspace",
    data: {
      id: "workspace-team",
      name: "Team APIs",
      description: "",
      createdAt: 1,
      updatedAt: 1,
    },
  });
  await router.replace({ path: "/", query: { request: "request-one" } });
});

function mountDialog() {
  return mount(CommandDialog, {
    global: { plugins: [i18n, router] },
    attachTo: document.body,
  });
}

function commandButton(wrapper: ReturnType<typeof mountDialog>, label: string) {
  const button = wrapper
    .findAll<HTMLButtonElement>(".command-results > button")
    .find((item) => item.text().includes(label));
  if (!button) throw new Error(`Missing command: ${label}`);
  return button;
}

describe("CommandDialog", () => {
  it("shows actions, requests, and workspaces and filters across them", async () => {
    const wrapper = mountDialog();

    expect(wrapper.text()).toContain("Copy as cURL");
    expect(wrapper.text()).toContain("Delete request");
    expect(wrapper.text()).toContain("Create environment");
    expect(wrapper.text()).toContain("Create user");
    expect(wrapper.text()).toContain("Team APIs");

    await wrapper.get("input").setValue("team");
    expect(wrapper.text()).toContain("Team APIs");
    expect(wrapper.text()).not.toContain("Create user");
    wrapper.unmount();
  });

  it("navigates with Ctrl+J/K while keeping the search input focused", async () => {
    const wrapper = mountDialog();
    await nextTick();
    const input = wrapper.get<HTMLInputElement>("input");
    expect(document.activeElement).toBe(input.element);
    const secondCommand = wrapper.findAll<HTMLButtonElement>(
      ".command-results > button",
    )[1]!;
    secondCommand.element.scrollIntoView = () => secondCommand.element.focus();

    const down = new KeyboardEvent("keydown", {
      key: "j",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.element.dispatchEvent(down);
    await nextTick();

    expect(down.defaultPrevented).toBe(true);
    expect(secondCommand.classes()).toContain("is-selected");
    expect(document.activeElement).toBe(input.element);

    const up = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.element.dispatchEvent(up);
    await nextTick();

    expect(up.defaultPrevented).toBe(true);
    expect(
      wrapper.findAll(".command-results > button")[0]?.classes(),
    ).toContain("is-selected");
    expect(document.activeElement).toBe(input.element);

    await input.setValue("team");
    expect(wrapper.text()).toContain("Team APIs");
    expect(wrapper.text()).not.toContain("Create user");
    expect(document.activeElement).toBe(input.element);
    wrapper.unmount();
  });

  it("switches requests and workspaces", async () => {
    const models = useModelsStore();
    const wrapper = mountDialog();

    await commandButton(wrapper, "Create user").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.request).toBe("request-two");
    expect(models.currentRequest?.id).toBe("request-two");

    await commandButton(wrapper, "Team APIs").trigger("click");
    await flushPromises();
    expect(models.activeWorkspaceId).toBe("workspace-team");
    expect(router.currentRoute.value.fullPath).toBe("/");
    wrapper.unmount();
  });

  it("copies cURL and confirms deletion of the active request", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const models = useModelsStore();
    const wrapper = mountDialog();

    await commandButton(wrapper, "Copy as cURL").trigger("click");
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("--url 'https://example.com'"),
    );
    expect(useUiStore().toast).toMatchObject({
      kind: "success",
      message: "cURL copied to clipboard.",
    });

    await commandButton(wrapper, "Delete request").trigger("click");
    expect(wrapper.text()).toContain("Delete request?");
    const confirm = wrapper.get(".command-confirmation-actions .is-danger");
    await confirm.trigger("click");
    await flushPromises();
    expect(
      models.httpRequests.some(({ id }) => id === "request-one"),
    ).toBe(false);
    wrapper.unmount();
  });

  it("shows an error toast when copying cURL fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("Clipboard denied")),
      },
    });
    const wrapper = mountDialog();

    await commandButton(wrapper, "Copy as cURL").trigger("click");
    await flushPromises();

    expect(useUiStore().toast).toMatchObject({
      kind: "error",
      message: "Could not copy cURL.",
    });
    expect(wrapper.text()).toContain("The action could not be completed.");
    wrapper.unmount();
  });
});
