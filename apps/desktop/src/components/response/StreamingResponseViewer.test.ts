// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { beforeEach, describe, expect, it } from "vitest";
import enUS from "../../i18n/locales/en-US";
import StreamingResponseViewer from "./StreamingResponseViewer.vue";

const i18n = createI18n({
  legacy: false,
  locale: "en-US",
  messages: { "en-US": enUS },
});

const body = [
  'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}',
  "",
  'data: {"choices":[{"delta":{"content":"Hello"}}]}',
  "",
  'data: {"choices":[{"delta":{"content":" world"}}]}',
  "",
  "data: [DONE]",
  "",
].join("\n");

beforeEach(() => localStorage.clear());

function mountViewer() {
  return mount(StreamingResponseViewer, {
    props: {
      body,
      contentType: "text/event-stream",
      isLive: false,
      responseId: "response-one",
    },
    global: {
      plugins: [i18n],
      stubs: {
        ResponseCodeViewer: {
          name: "ResponseCodeViewer",
          props: ["content", "language", "enableJsonPathContext"],
          emits: ["jsonPathContext"],
          template: '<pre class="stub-code-viewer">{{ content }}</pre>',
        },
      },
    },
  });
}

async function switchToJsonPath(
  wrapper: ReturnType<typeof mountViewer>,
) {
  await wrapper.find(".stream-view-select .stream-select-trigger").trigger("click");
  const option = wrapper
    .findAll(".stream-view-select .stream-select-menu button")
    .find((button) => button.text() === "JSONPath");
  await option!.trigger("click");
}

describe("StreamingResponseViewer", () => {
  it("shows full events and opens the selected event detail", async () => {
    const wrapper = mountViewer();
    const events = wrapper.findAll('.stream-event-list [role="option"]');
    expect(events).toHaveLength(4);

    await events[1]!.trigger("click");

    expect(wrapper.find(".stream-event-detail").exists()).toBe(true);
    expect(wrapper.find(".stub-code-viewer").text()).toContain('"content": "Hello"');
  });

  it("switches to JSONPath and renders extracted text", async () => {
    const wrapper = mountViewer();
    await switchToJsonPath(wrapper);

    expect(wrapper.find(".stream-extracted-text pre").text()).toBe("Hello world");
    expect(wrapper.findAll(".stream-select-trigger")).toHaveLength(2);
    expect(wrapper.find(".stream-preset-select .stream-select-trigger").text()).toContain(
      "Chat Completions (OpenAI)",
    );
    expect(wrapper.find('input[aria-label="JSONPath"]').element.getAttribute("value")).toBe(
      "$.choices[0].delta.content",
    );
  });

  it("uses an event detail field as a custom JSONPath", async () => {
    const wrapper = mountViewer();
    await wrapper.findAll('.stream-event-list [role="option"]')[1]!.trigger("click");

    wrapper.findComponent({ name: "ResponseCodeViewer" }).vm.$emit(
      "jsonPathContext",
      {
        path: "$.choices[0].delta.content",
        clientX: 120,
        clientY: 200,
      },
    );
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".stream-jsonpath-context-menu").exists()).toBe(true);
    await wrapper.find(".stream-jsonpath-context-menu button").trigger("click");

    expect(wrapper.find(".stream-view-select .stream-select-trigger").text()).toContain(
      "JSONPath",
    );
    expect(wrapper.find(".stream-preset-select .stream-select-trigger").text()).toContain(
      "Custom JSONPath",
    );
    expect(wrapper.find<HTMLInputElement>('input[aria-label="JSONPath"]').element.value).toBe(
      "$.choices[0].delta.content",
    );
    expect(wrapper.find(".stream-extracted-text pre").text()).toBe("Hello world");
  });

  it("resizes adjacent panels with the keyboard and remembers the ratio", async () => {
    const wrapper = mountViewer();
    await switchToJsonPath(wrapper);
    Object.defineProperty(wrapper.find(".stream-inspector").element, "clientHeight", {
      configurable: true,
      value: 400,
    });
    const handle = wrapper.find('[role="separator"]');
    const before = Number(handle.attributes("aria-valuenow"));

    await handle.trigger("keydown", { key: "ArrowDown" });

    expect(Number(handle.attributes("aria-valuenow"))).toBeGreaterThan(before);
    expect(localStorage.getItem("crono:stream-panel-sizes")).not.toBeNull();
  });
});
