import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export function codeMirrorCspNonceExtension(doc: Document = document): Extension {
  const nonce = doc.querySelector<HTMLElement>(
    "style[nonce], link[nonce]",
  )?.nonce;

  return nonce ? EditorView.cspNonce.of(nonce) : [];
}
