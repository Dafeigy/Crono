import type {
  Environment,
  HttpRequest,
  KeyValue,
} from "@crono/client-core";

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

function enabledValues(values: KeyValue[]) {
  return values.filter(({ enabled, name }) => enabled && name.length > 0);
}

function appendQuery(
  url: string,
  values: Array<{ name: string; value: string }>,
) {
  if (!values.length) return url;
  const hashIndex = url.indexOf("#");
  const base = hashIndex < 0 ? url : url.slice(0, hashIndex);
  const hash = hashIndex < 0 ? "" : url.slice(hashIndex);
  const separator = base.includes("?")
    ? base.endsWith("?") || base.endsWith("&")
      ? ""
      : "&"
    : "?";
  const query = values
    .map(
      ({ name, value }) =>
        `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    )
    .join("&");
  return `${base}${separator}${query}${hash}`;
}

export function environmentVariableMap(
  environments: Environment[],
  environmentId?: string,
) {
  const chain: Environment[] = [];
  const visited = new Set<string>();
  let currentId = environmentId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const environment = environments.find(({ id }) => id === currentId);
    if (!environment) break;
    chain.push(environment);
    currentId = environment.parentId ?? undefined;
  }

  const variables: Record<string, string> = {};
  for (const environment of chain.reverse()) {
    for (const variable of enabledValues(environment.variables)) {
      variables[variable.name] = variable.value;
    }
  }
  return variables;
}

export function renderRequestTemplate(
  input: string,
  variables: Record<string, string>,
) {
  return input.replace(/\{\{(.*?)\}\}/g, (source, rawKey: string) => {
    const key = rawKey.trim();
    if (key === "$uuid") return crypto.randomUUID();
    if (key === "$timestamp") return Date.now().toString();
    return variables[key] ?? source;
  });
}

export function requestToCurl(
  request: HttpRequest,
  variables: Record<string, string> = {},
) {
  const render = (value: string) => renderRequestTemplate(value, variables);
  const query = enabledValues(request.parameters).map(({ name, value }) => ({
    name: render(name),
    value: render(value),
  }));
  const headers = enabledValues(request.headers).map(({ name, value }) => ({
    name: render(name),
    value: render(value),
  }));

  if (
    request.authentication.type === "api_key" &&
    request.authentication.location === "query"
  ) {
    query.push({
      name: render(request.authentication.name),
      value: render(request.authentication.value),
    });
  }

  const parts = [
    "curl",
    `--request ${shellQuote(request.method)}`,
    `--url ${shellQuote(appendQuery(render(request.url), query))}`,
  ];

  for (const { name, value } of headers) {
    parts.push(`--header ${shellQuote(`${name}: ${value}`)}`);
  }

  switch (request.authentication.type) {
    case "basic":
      parts.push(
        `--user ${shellQuote(
          `${render(request.authentication.username)}:${render(
            request.authentication.password,
          )}`,
        )}`,
      );
      break;
    case "bearer": {
      const prefix = render(request.authentication.prefix).trim();
      const token = render(request.authentication.token);
      parts.push(
        `--header ${shellQuote(
          `Authorization: ${prefix ? `${prefix} ${token}` : token}`,
        )}`,
      );
      break;
    }
    case "api_key":
      if (request.authentication.location !== "query") {
        parts.push(
          `--header ${shellQuote(
            `${render(request.authentication.name)}: ${render(
              request.authentication.value,
            )}`,
          )}`,
        );
      }
      break;
  }

  switch (request.body.type) {
    case "text":
      parts.push(`--data-raw ${shellQuote(render(request.body.value))}`);
      break;
    case "json":
      parts.push("--header 'content-type: application/json'");
      parts.push(`--data-raw ${shellQuote(render(request.body.value))}`);
      break;
    case "form":
      for (const { name, value } of enabledValues(request.body.value)) {
        parts.push(
          `--data-urlencode ${shellQuote(`${render(name)}=${render(value)}`)}`,
        );
      }
      break;
  }

  if (request.timeoutMs > 0) {
    parts.push(`--max-time ${request.timeoutMs / 1000}`);
  }
  return parts.join(" \\\n  ");
}
