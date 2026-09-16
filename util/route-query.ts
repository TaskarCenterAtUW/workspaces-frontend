import type { LocationQueryValue } from 'vue-router';

export function parsePositiveIntegerQuery(
  value: LocationQueryValue | LocationQueryValue[]
): number | undefined {
  if (Array.isArray(value)) {
    return undefined;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : undefined;
}