// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { codeMirrorCspNonceExtension } from "./codeMirrorCsp";

describe("codeMirrorCspNonceExtension", () => {
  it("passes Tauri's injected style nonce to CodeMirror", () => {
    const doc = document.implementation.createHTMLDocument();
    const style = doc.createElement("style");
    style.nonce = "tauri-style-nonce";
    doc.head.append(style);

    const state = EditorState.create({
      extensions: [codeMirrorCspNonceExtension(doc)],
    });

    expect(state.facet(EditorView.cspNonce)).toBe("tauri-style-nonce");
  });

  it("uses CodeMirror's default when the document has no nonce", () => {
    const doc = document.implementation.createHTMLDocument();
    const state = EditorState.create({
      extensions: [codeMirrorCspNonceExtension(doc)],
    });

    expect(state.facet(EditorView.cspNonce)).toBe("");
  });
});
