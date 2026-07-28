export function settingsReturnPath(from: unknown) {
  const value = Array.isArray(from) ? from[0] : from;
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("/settings")
    ? value
    : "/";
}
