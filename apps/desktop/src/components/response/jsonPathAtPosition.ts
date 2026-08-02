import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

const JSON_VALUE_NODES = new Set([
  "Object",
  "Array",
  "String",
  "Number",
  "True",
  "False",
  "Null",
]);

function propertySegment(state: EditorState, from: number, to: number) {
  try {
    const value = JSON.parse(state.sliceDoc(from, to));
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function formatPropertySegment(segment: string) {
  if (/^[A-Za-z_$][\w$]*$/u.test(segment)) return `.${segment}`;
  return `['${segment.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}']`;
}

/** Returns the JSONPath for the JSON field or value under a document position. */
export function jsonPathAtPosition(state: EditorState, position: number) {
  let node = syntaxTree(state).resolveInner(position, -1);
  const segments: Array<string | number> = [];

  while (node) {
    if (node.name === "Property") {
      const propertyName = node.getChild("PropertyName");
      if (!propertyName) return null;
      const segment = propertySegment(
        state,
        propertyName.from,
        propertyName.to,
      );
      if (segment === null) return null;
      segments.push(segment);
    }

    const parent = node.parent;
    if (parent?.name === "Array" && JSON_VALUE_NODES.has(node.name)) {
      let child = parent.firstChild;
      let index = 0;
      while (child) {
        if (JSON_VALUE_NODES.has(child.name)) {
          if (child.from === node.from && child.to === node.to) {
            segments.push(index);
            break;
          }
          index += 1;
        }
        child = child.nextSibling;
      }
    }
    node = parent!;
  }

  if (!segments.length) return null;
  return `$${segments
    .reverse()
    .map((segment) =>
      typeof segment === "number"
        ? `[${segment}]`
        : formatPropertySegment(segment),
    )
    .join("")}`;
}
