import { json } from "@codemirror/lang-json";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { jsonPathAtPosition } from "./jsonPathAtPosition";

const document = JSON.stringify({
  choices: [
    { delta: { content: "Hello", "reasoning-content": "Thinking" } },
    { delta: { content: "World" } },
  ],
});
const state = EditorState.create({ doc: document, extensions: [json()] });

function positionOf(value: string) {
  return document.indexOf(value) + 1;
}

describe("jsonPathAtPosition", () => {
  it("builds a path for nested object and array fields", () => {
    expect(jsonPathAtPosition(state, positionOf("Hello"))).toBe(
      "$.choices[0].delta.content",
    );
    expect(jsonPathAtPosition(state, positionOf("World"))).toBe(
      "$.choices[1].delta.content",
    );
  });

  it("quotes property names that cannot use dot notation", () => {
    expect(jsonPathAtPosition(state, positionOf("Thinking"))).toBe(
      "$.choices[0].delta['reasoning-content']",
    );
  });
});
