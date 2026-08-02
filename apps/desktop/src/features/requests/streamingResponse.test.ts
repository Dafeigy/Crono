import { describe, expect, it } from "vitest";
import {
  parseServerSentEvents,
  parseStreamingResponse,
  STREAM_EXTRACTION_PRESETS,
} from "./streamingResponse";

describe("streaming response parsing", () => {
  const openAiBody = [
    'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}',
    "",
    'data: {"choices":[{"delta":{"content":"Hello"}}]}',
    "",
    'data: {"choices":[{"delta":{"content":" world"}}]}',
    "",
    "data: [DONE]",
    "",
  ].join("\r\n");

  it("keeps every OpenAI event and combines the selected JSONPath", () => {
    const parsed = parseStreamingResponse(
      openAiBody,
      "text/event-stream; charset=utf-8",
    );
    expect(parsed.events).toHaveLength(4);
    expect(parsed.events[1]!.eventType).toBe("message");
    expect(parsed.events[1]!.value).toEqual({
      choices: [{ delta: { content: "Hello" } }],
    });
    expect(parsed.events[3]!.isDone).toBe(true);
    expect(parsed.content).toBe("Hello world");
    expect(parsed.eventCount).toBe(3);
    expect(parsed.parsedEventCount).toBe(3);
  });

  it.each([
    ["openai-responses", 'data: {"delta":"Hi"}\n\n', "Hi"],
    ["anthropic-claude", 'data: {"delta":{"text":"Hi"}}\n\n', "Hi"],
    [
      "google-gemini",
      'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}\n\n',
      "Hi",
    ],
  ])("supports the %s preset", (presetId, body, expected) => {
    const preset = STREAM_EXTRACTION_PRESETS.find(({ id }) => id === presetId)!;
    expect(parseStreamingResponse(body, "text/event-stream", preset.path).content).toBe(
      expected,
    );
  });

  it("supports wildcard and bracket-property JSONPath segments", () => {
    const body = 'data: {"items":[{"value":"a"},{"value":"b"}]}\n\n';
    const parsed = parseStreamingResponse(body, null, "$['items'][*].value");
    expect(parsed.content).toBe("ab");
  });

  it("waits for the SSE event boundary while a response is still streaming", () => {
    expect(parseServerSentEvents('data: {"delta":"part', false)).toEqual([]);
    expect(parseServerSentEvents('data: {"delta":"done"}\n\n', false)).toHaveLength(1);
  });

  it("reports invalid JSONPath without losing full events", () => {
    const parsed = parseStreamingResponse(openAiBody, "text/event-stream", "choices[0]");
    expect(parsed.pathError).toBe("Invalid JSONPath");
    expect(parsed.content).toBe("");
    expect(parsed.events).toHaveLength(4);
  });

  it("does not treat ordinary JSON as a streaming response", () => {
    const parsed = parseStreamingResponse('{"message":"ok"}', "application/json");
    expect(parsed.isStreaming).toBe(false);
    expect(parsed.events).toEqual([]);
  });
});
