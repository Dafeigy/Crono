// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { describe, expect, it } from "vitest";
import TemplateVariableInput from "./TemplateVariableInput.vue";

const i18n = createI18n({
  legacy: false,
  locale: "en-US",
  messages: {
    "en-US": {
      request: {
        builtInVariable: "Built-in variable",
        editVariableReference: "Edit variable reference",
        fromEnvironment: "From {name}",
        inheritedFromEnvironment: "Inherited from {name}",
        removeVariableReference: "Remove {name} variable reference",
        variableSuggestions: "Environment variable suggestions",
      },
    },
  },
});

describe("TemplateVariableInput", () => {
  it("completes a typed query and renders the reference as a tag", async () => {
    const wrapper = mount(TemplateVariableInput, {
      props: {
        modelValue: "L",
        variables: [
          {
            name: "LiteLlmKey",
            source: "Prod-litellm",
          },
          {
            name: "baseUrl",
            source: "Global",
            inherited: true,
          },
        ],
        masked: true,
      },
      global: { plugins: [i18n] },
      attachTo: document.body,
    });

    const input = wrapper.get("input");
    await input.trigger("focus");
    expect(wrapper.get('[role="listbox"]').isVisible()).toBe(true);
    expect(wrapper.findAll('[role="option"]')).toHaveLength(2);
    expect(wrapper.text()).toContain("LiteLlmKey");
    expect(wrapper.text()).toContain("From Prod-litellm");

    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([
      "{{LiteLlmKey}}",
    ]);

    await wrapper.setProps({ modelValue: "{{LiteLlmKey}}" });
    expect(wrapper.get(".template-variable-tag").text()).toContain(
      "LiteLlmKey",
    );
    expect(wrapper.find(".template-variable-tag-label svg").exists()).toBe(
      false,
    );
    expect(wrapper.find('input[type="password"]').exists()).toBe(false);

    const tag = wrapper.get(".template-variable-tag-label");
    await tag.trigger("keydown", { key: "Backspace" });
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([""]);

    await wrapper.setProps({ modelValue: "" });
    expect(wrapper.find(".template-variable-tag").exists()).toBe(false);
    expect(wrapper.get("input").element).toBe(document.activeElement);
    wrapper.unmount();
  });

  it("supports arrow-key selection from the full suggestion list", async () => {
    const wrapper = mount(TemplateVariableInput, {
      props: {
        modelValue: ".",
        variables: [
          { name: "first", source: "Development" },
          { name: "second", source: "Development" },
        ],
      },
      global: { plugins: [i18n] },
    });

    const input = wrapper.get("input");
    await input.trigger("focus");
    expect(wrapper.findAll('[role="option"]')).toHaveLength(2);
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([
      "{{second}}",
    ]);
  });

  it("releases input focus when Escape is pressed", async () => {
    const wrapper = mount(TemplateVariableInput, {
      props: {
        modelValue: "https://api.example.com",
        variables: [],
      },
      global: { plugins: [i18n] },
      attachTo: document.body,
    });

    const input = wrapper.get("input");
    input.element.focus();
    expect(input.element).toBe(document.activeElement);

    await input.trigger("keydown", { key: "Escape" });
    expect(input.element).not.toBe(document.activeElement);
    wrapper.unmount();
  });

  it("removes a tag with its visible remove control", async () => {
    const wrapper = mount(TemplateVariableInput, {
      props: {
        modelValue: "{{LiteLlmKey}}",
        variables: [{ name: "LiteLlmKey", source: "Production" }],
      },
      global: { plugins: [i18n] },
    });

    await wrapper.get(".template-variable-tag-remove").trigger("click");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([""]);
  });
});
