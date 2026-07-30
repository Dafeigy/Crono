import type { Environment, HttpRequest } from "@crono/client-core";
import { describe, expect, it } from "vitest";
import {
  environmentVariableMap,
  renderRequestTemplate,
  requestToCurl,
} from "./curl";

function request(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    id: "request",
    workspaceId: "workspace",
    folderId: null,
    name: "Example",
    method: "GET",
    url: "https://example.com",
    parameters: [],
    headers: [],
    body: { type: "none" },
    authentication: { type: "none" },
    timeoutMs: 30_000,
    sortPriority: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("requestToCurl", () => {
  it("serializes enabled parameters, headers, JSON, and bearer auth", () => {
    const result = requestToCurl(
      request({
        method: "POST",
        url: "{{baseUrl}}/users",
        parameters: [
          { id: "one", enabled: true, name: "page", value: "1" },
          { id: "two", enabled: false, name: "hidden", value: "yes" },
        ],
        headers: [
          { id: "header", enabled: true, name: "x-client", value: "Crono" },
        ],
        body: { type: "json", value: '{"name":"{{name}}"}' },
        authentication: {
          type: "bearer",
          prefix: "Token",
          token: "{{token}}",
        },
      }),
      {
        baseUrl: "https://api.example.com",
        name: "Ada",
        token: "secret",
      },
    );

    expect(result).toContain("--request 'POST'");
    expect(result).toContain("--url 'https://api.example.com/users?page=1'");
    expect(result).toContain("--header 'x-client: Crono'");
    expect(result).toContain("--header 'Authorization: Token secret'");
    expect(result).toContain("--header 'content-type: application/json'");
    expect(result).toContain(`--data-raw '{"name":"Ada"}'`);
    expect(result).not.toContain("hidden");
  });

  it("escapes single quotes and serializes form and query API keys", () => {
    const result = requestToCurl(
      request({
        url: "https://example.com/path#result",
        body: {
          type: "form",
          value: [
            { id: "field", enabled: true, name: "owner", value: "O'Reilly" },
          ],
        },
        authentication: {
          type: "api_key",
          name: "api key",
          value: "a+b",
          location: "query",
        },
      }),
    );

    expect(result).toContain(
      "--url 'https://example.com/path?api%20key=a%2Bb#result'",
    );
    expect(result).toContain(`--data-urlencode 'owner=O'\"'\"'Reilly'`);
  });
});

describe("environment variables", () => {
  it("inherits enabled variables and lets a child override its parent", () => {
    const environments: Environment[] = [
      {
        id: "parent",
        workspaceId: "workspace",
        parentId: null,
        name: "Parent",
        color: null,
        variables: [
          { id: "one", enabled: true, name: "host", value: "parent.test" },
          { id: "two", enabled: true, name: "token", value: "parent" },
        ],
        sortPriority: 1,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "child",
        workspaceId: "workspace",
        parentId: "parent",
        name: "Child",
        color: null,
        variables: [
          { id: "three", enabled: true, name: "token", value: "child" },
          { id: "four", enabled: false, name: "ignored", value: "no" },
        ],
        sortPriority: 2,
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    expect(environmentVariableMap(environments, "child")).toEqual({
      host: "parent.test",
      token: "child",
    });
    expect(
      renderRequestTemplate(
        "https://{{host}}?token={{ token }}&missing={{missing}}",
        environmentVariableMap(environments, "child"),
      ),
    ).toBe("https://parent.test?token=child&missing={{missing}}");
  });
});
