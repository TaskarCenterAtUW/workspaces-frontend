import { describe, expect, it } from 'vitest';
import { formatTaskLockTimeRemaining } from '~/composables/useTaskLockCountdown';

describe('formatTaskLockTimeRemaining', () => {
  const currentTime = Date.parse('2026-07-27T10:00:00Z');

  it('formats the remaining lock duration', () => {
    expect(
      formatTaskLockTimeRemaining('2026-07-27T11:32:00Z', currentTime),
    ).toBe('1 hour, 32 minutes left');
  });

  it('reports expired and missing locks', () => {
    expect(
      formatTaskLockTimeRemaining('2026-07-27T09:59:00Z', currentTime),
    ).toBe('Lock expired');
    expect(formatTaskLockTimeRemaining(undefined, currentTime)).toBe('');
  });
});
