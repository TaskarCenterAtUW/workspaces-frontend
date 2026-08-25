export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalises a tdeiMetadata value that may arrive from the API as a
 * JSON-encoded string or as an already-parsed object.  Returns null for
 * missing, empty, or unparseable values so callers can treat the result as
 * a plain Record without additional type guards.
 */
export function parseMetadata(value: unknown): Record<string, unknown> | null {
  if (value == null || value === '') return null;
  if (isRecord(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}
