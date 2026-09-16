/** Returns the parser message when a JSON document is invalid. */
export function jsonSyntaxError(value: string): string | undefined {
  try {
    JSON.parse(value);
    return undefined;
  } catch (error) {
    return error instanceof SyntaxError ? error.message : "Invalid JSON";
  }
}
