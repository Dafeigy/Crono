<script setup lang="ts">
import { json } from "@codemirror/lang-json";
import { Compartment, EditorState } from "@codemirror/state";
import {
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorView, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { codeMirrorCspNonceExtension } from "./codeMirrorCsp";
import { jsonPathAtPosition } from "./jsonPathAtPosition";

export interface JsonPathContextPayload {
  path: string;
  clientX: number;
  clientY: number;
}

const props = withDefaults(
  defineProps<{
    content: string;
    language?: "json" | "text";
    enableJsonPathContext?: boolean;
  }>(),
  {
    language: "text",
  },
);

const emit = defineEmits<{
  jsonPathContext: [payload: JsonPathContextPayload];
}>();

const editorElement = ref<HTMLElement>();
const language = new Compartment();
let view: EditorView | undefined;

const cronoHighlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.bool, tags.null], color: "var(--syntax-keyword)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--syntax-string)" },
  { tag: tags.propertyName, color: "var(--syntax-property)" },
  { tag: [tags.number, tags.variableName], color: "var(--syntax-variable)" },
  { tag: tags.operator, color: "var(--syntax-operator)" },
  { tag: tags.comment, color: "var(--crono-text-subtle)", fontStyle: "italic" },
]);

const cronoTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--editor, var(--response-pane))",
    color: "var(--foreground)",
    fontSize: "12px",
  },
  ".cm-scroller": {
    overflowX: "hidden",
    overflowY: "auto",
    fontFamily:
      '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    lineHeight: "1.62",
  },
  ".cm-content": {
    padding: "10px 0 24px",
    caretColor: "transparent",
  },
  ".cm-line": {
    padding: "0 14px 0 10px",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
  ".cm-gutters": {
    minWidth: "42px",
    border: "0",
    borderRight: "1px solid var(--crono-border-subtle)",
    backgroundColor: "var(--editor, var(--response-pane))",
    color: "var(--crono-text-subtle)",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "34px",
    padding: "0 9px 0 4px",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in oklch, var(--primary) 24%, transparent) !important",
  },
  "&.cm-focused": {
    outline: "none",
  },
});

function languageExtension() {
  return props.language === "json" ? json() : [];
}

onMounted(() => {
  if (!editorElement.value) return;
  view = new EditorView({
    parent: editorElement.value,
    state: EditorState.create({
      doc: props.content,
      extensions: [
        lineNumbers(),
        EditorView.lineWrapping,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.domEventHandlers({
          contextmenu(event, editorView) {
            if (!props.enableJsonPathContext || props.language !== "json") {
              return false;
            }
            const position = editorView.posAtCoords({
              x: event.clientX,
              y: event.clientY,
            });
            if (position === null) return false;
            const path = jsonPathAtPosition(editorView.state, position);
            if (!path) return false;
            event.preventDefault();
            emit("jsonPathContext", {
              path,
              clientX: event.clientX,
              clientY: event.clientY,
            });
            return true;
          },
        }),
        EditorView.contentAttributes.of({
          "aria-label": "Response body",
          tabindex: "0",
        }),
        codeMirrorCspNonceExtension(),
        syntaxHighlighting(cronoHighlightStyle),
        cronoTheme,
        language.of(languageExtension()),
      ],
    }),
  });
});

watch(
  () => props.content,
  (content) => {
    if (!view || content === view.state.doc.toString()) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
    });
  },
);

watch(
  () => props.language,
  () => {
    view?.dispatch({ effects: language.reconfigure(languageExtension()) });
  },
);

onBeforeUnmount(() => view?.destroy());
</script>

<template>
  <div ref="editorElement" class="response-code-viewer" />
</template>
