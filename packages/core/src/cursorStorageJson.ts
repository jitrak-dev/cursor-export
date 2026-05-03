/** Parsed JSON value tree (ItemTable / workspace.json values). */
export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export function isJsonObject(
  value: JsonValue | undefined,
): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseJsonFromUtf8(text: string): JsonValue | undefined {
  try {
    const parsed: JsonValue = JSON.parse(text) as JsonValue;
    return parsed;
  } catch {
    return undefined;
  }
}
