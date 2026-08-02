export const STREAM_EXTRACTION_PRESETS = [
  {
    id: "openai-chat-completions",
    label: "Chat Completions (OpenAI)",
    path: "$.choices[0].delta.content",
  },
  {
    id: "openai-responses",
    label: "Responses (OpenAI)",
    path: "$.delta",
  },
  {
    id: "anthropic-claude",
    label: "Claude (Anthropic)",
    path: "$.delta.text",
  },
  {
    id: "google-gemini",
    label: "Gemini (Google)",
    path: "$.candidates[0].content.parts[0].text",
  },
] as const;

export type StreamExtractionPresetId =
  | (typeof STREAM_EXTRACTION_PRESETS)[number]["id"]
  | "custom";

export interface StreamEvent {
  index: number;
  eventType: string;
  data: string;
  raw: string;
  value: unknown | null;
  isDone: boolean;
  summary: string;
}

export interface ParsedStreamingResponse {
  isStreaming: boolean;
  events: StreamEvent[];
  content: string;
  eventCount: number;
  parsedEventCount: number;
  contentPath: string;
  pathError: string | null;
}

type JsonPathToken =
  | { type: "property"; value: string }
  | { type: "index"; value: number }
  | { type: "wildcard" };

function parseJsonPath(path: string): JsonPathToken[] | null {
  const input = path.trim();
  if (!input.startsWith("$")) return null;
  const tokens: JsonPathToken[] = [];
  let cursor = 1;

  while (cursor < input.length) {
    if (input[cursor] === ".") {
      const start = ++cursor;
      while (cursor < input.length && !".[]".includes(input[cursor] ?? "")) {
        cursor += 1;
      }
      if (start === cursor) return null;
      tokens.push({ type: "property", value: input.slice(start, cursor) });
      continue;
    }

    if (input[cursor] === "[") {
      const end = input.indexOf("]", cursor + 1);
      if (end < 0) return null;
      const segment = input.slice(cursor + 1, end).trim();
      if (segment === "*") {
        tokens.push({ type: "wildcard" });
      } else if (/^\d+$/.test(segment)) {
        tokens.push({ type: "index", value: Number(segment) });
      } else {
        const property = segment.match(/^(['"])(.*)\1$/)?.[2];
        if (property === undefined) return null;
        tokens.push({ type: "property", value: property });
      }
      cursor = end + 1;
      continue;
    }

    return null;
  }

  return tokens;
}

function queryJsonPath(value: unknown, tokens: JsonPathToken[]): unknown[] {
  let values = [value];
  for (const token of tokens) {
    values = values.flatMap((current) => {
      if (token.type === "wildcard") {
        if (Array.isArray(current)) return current;
        if (current && typeof current === "object") return Object.values(current);
        return [];
      }
      if (token.type === "index") {
        return Array.isArray(current) && token.value < current.length
          ? [current[token.value]]
          : [];
      }
      if (!current || typeof current !== "object") return [];
      const record = current as Record<string, unknown>;
      return Object.hasOwn(record, token.value) ? [record[token.value]] : [];
    });
  }
  return values;
}

function eventSummary(value: unknown | null, data: string) {
  if (value === null) return data;
  try {
    return JSON.stringify(value);
  } catch {
    return data;
  }
}

export function parseServerSentEvents(
  body: string,
  includeTrailingEvent = true,
): StreamEvent[] {
  const normalized = body.replace(/\r\n?/g, "\n");
  const blocks = normalized.split(/\n{2,}/);
  if (!includeTrailingEvent && !/\n{2,}$/.test(normalized)) blocks.pop();

  const events: StreamEvent[] = [];
  for (const raw of blocks) {
    if (!raw.trim()) continue;
    let eventType = "message";
    const dataLines: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) {
        eventType = line.slice(6).replace(/^ /, "") || "message";
      } else if (line === "data" || line.startsWith("data:")) {
        dataLines.push(line === "data" ? "" : line.slice(5).replace(/^ /, ""));
      }
    }
    if (!dataLines.length) continue;

    const data = dataLines.join("\n");
    const isDone = data.trim() === "[DONE]";
    let value: unknown | null = null;
    if (!isDone) {
      try {
        value = JSON.parse(data);
      } catch {
        value = null;
      }
    }
    events.push({
      index: events.length,
      eventType: isDone && eventType === "message" ? "done" : eventType,
      data,
      raw,
      value,
      isDone,
      summary: eventSummary(value, data),
    });
  }
  return events;
}

export function parseStreamingResponse(
  body: string,
  contentType?: string | null,
  jsonPath: string = STREAM_EXTRACTION_PRESETS[0].path,
  includeTrailingEvent = true,
): ParsedStreamingResponse {
  const events = parseServerSentEvents(body, includeTrailingEvent);
  const isStreaming =
    contentType?.toLowerCase().includes("text/event-stream") === true ||
    events.length > 0 ||
    /(^|\n)(event|data):/.test(body);
  const tokens = parseJsonPath(jsonPath);
  const chunks: string[] = [];
  let parsedEventCount = 0;

  if (tokens) {
    for (const event of events) {
      if (event.value === null) continue;
      const extracted = queryJsonPath(event.value, tokens).filter(
        (value): value is string => typeof value === "string",
      );
      if (!extracted.length) continue;
      parsedEventCount += 1;
      chunks.push(...extracted);
    }
  }

  return {
    isStreaming,
    events,
    content: chunks.join(""),
    eventCount: events.filter(({ isDone }) => !isDone).length,
    parsedEventCount,
    contentPath: jsonPath,
    pathError: tokens ? null : "Invalid JSONPath",
  };
}
