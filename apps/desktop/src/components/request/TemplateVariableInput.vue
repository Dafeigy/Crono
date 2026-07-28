<script setup lang="ts">
import { Braces, Check, X } from "lucide-vue-next";
import { Button } from "@crono/ui";
import { computed, nextTick, ref, useAttrs, useId, watch } from "vue";
import { useI18n } from "vue-i18n";

export interface TemplateVariableOption {
  name: string;
  source: string;
  inherited?: boolean;
  builtIn?: boolean;
}

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue: string;
    variables: TemplateVariableOption[];
    placeholder?: string;
    masked?: boolean;
  }>(),
  {
    placeholder: "",
    masked: false,
  },
);
const emit = defineEmits<{
  "update:modelValue": [value: string];
  submit: [];
}>();
const { t } = useI18n();
const attrs = useAttrs();
const componentId = useId();
const listboxId = `${componentId}-variable-listbox`;
const rootElement = ref<HTMLElement>();
const inputElement = ref<HTMLInputElement>();
const focused = ref(false);
const editingTag = ref(false);
const activeIndex = ref(0);

const referencedVariableName = computed(() => {
  const match = props.modelValue.match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
  if (!match) return undefined;
  const name = match[1];
  return props.variables.some((variable) => variable.name === name)
    ? name
    : undefined;
});
const showTag = computed(
  () => Boolean(referencedVariableName.value) && !editingTag.value,
);
const query = computed(() =>
  props.modelValue
    .trim()
    .replace(/^\{\{\s*/, "")
    .replace(/\s*\}\}$/, ""),
);
const filteredVariables = computed(() => {
  const normalized = query.value.toLocaleLowerCase();
  const shouldFilter = /[\p{L}\p{N}_$-]/u.test(normalized);
  if (!shouldFilter) return props.variables;
  return props.variables.filter((variable) =>
    variable.name.toLocaleLowerCase().includes(normalized),
  );
});
const showSuggestions = computed(
  () =>
    focused.value &&
    !showTag.value &&
    props.modelValue.length > 0 &&
    filteredVariables.value.length > 0,
);
const activeOptionId = computed(() =>
  showSuggestions.value
    ? `${componentId}-variable-option-${activeIndex.value}`
    : undefined,
);

watch(filteredVariables, () => {
  activeIndex.value = 0;
});

function updateValue(event: Event) {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}

function selectVariable(variable: TemplateVariableOption) {
  emit("update:modelValue", `{{${variable.name}}}`);
  editingTag.value = false;
  focused.value = false;
  activeIndex.value = 0;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    focused.value = false;
    inputElement.value?.blur();
    return;
  }
  if (showSuggestions.value) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      activeIndex.value =
        (activeIndex.value + direction + filteredVariables.value.length) %
        filteredVariables.value.length;
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const variable = filteredVariables.value[activeIndex.value];
      if (variable) selectVariable(variable);
      return;
    }
  }
  if (event.key === "Enter") emit("submit");
}

function editTag() {
  editingTag.value = true;
  focused.value = true;
  void nextTick(() => {
    inputElement.value?.focus();
    inputElement.value?.select();
  });
}

function removeTag() {
  emit("update:modelValue", "");
  editingTag.value = true;
  focused.value = true;
  void nextTick(() => inputElement.value?.focus());
}

function onRootKeydown(event: KeyboardEvent) {
  if (
    showTag.value &&
    (event.key === "Backspace" || event.key === "Delete")
  ) {
    event.preventDefault();
    removeTag();
  }
}

function onFocusOut(event: FocusEvent) {
  if (
    event.relatedTarget instanceof Node &&
    rootElement.value?.contains(event.relatedTarget)
  ) {
    return;
  }
  focused.value = false;
  editingTag.value = false;
}

function optionSource(variable: TemplateVariableOption) {
  if (variable.builtIn) return t("request.builtInVariable");
  return t(
    variable.inherited
      ? "request.inheritedFromEnvironment"
      : "request.fromEnvironment",
    { name: variable.source },
  );
}
</script>

<template>
  <div
    ref="rootElement"
    class="template-variable-input"
    :class="{ 'has-tag': showTag, 'has-suggestions': showSuggestions }"
    @focusout="onFocusOut"
    @keydown="onRootKeydown"
  >
    <div v-if="showTag" class="template-variable-tag">
      <button
        type="button"
        class="template-variable-tag-label"
        :title="t('request.editVariableReference')"
        @click="editTag"
      >
        <span>{{ referencedVariableName }}</span>
      </button>
      <Button
        type="button"
        class="template-variable-tag-remove"
        variant="ghost"
        size="icon"
        :aria-label="
          t('request.removeVariableReference', {
            name: referencedVariableName,
          })
        "
        :title="t('request.removeVariableReference', { name: referencedVariableName })"
        @click="removeTag"
      >
        <X :size="11" aria-hidden="true" />
      </Button>
    </div>
    <input
      v-else
      v-bind="attrs"
      ref="inputElement"
      :value="modelValue"
      :type="masked ? 'password' : 'text'"
      :placeholder="placeholder"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="showSuggestions"
      :aria-controls="showSuggestions ? listboxId : undefined"
      :aria-activedescendant="activeOptionId"
      autocomplete="off"
      spellcheck="false"
      @input="updateValue"
      @focus="focused = true"
      @keydown="onKeydown"
    />

    <div
      v-if="showSuggestions"
      :id="listboxId"
      class="template-variable-suggestions"
      role="listbox"
      :aria-label="t('request.variableSuggestions')"
    >
      <button
        v-for="(variable, index) in filteredVariables"
        :id="`${componentId}-variable-option-${index}`"
        :key="variable.name"
        type="button"
        role="option"
        :aria-selected="index === activeIndex"
        :class="{ 'is-active': index === activeIndex }"
        @pointerenter="activeIndex = index"
        @pointerdown.prevent="selectVariable(variable)"
      >
        <Braces :size="12" aria-hidden="true" />
        <strong>{{ variable.name }}</strong>
        <span>{{ optionSource(variable) }}</span>
        <Check v-if="index === activeIndex" :size="12" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
