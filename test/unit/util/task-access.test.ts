import { describe, expect, it } from 'vitest';
import { isTaskSelfValidation } from '~/util/task-access';

describe('isTaskSelfValidation', () => {
  it('blocks a validation task for the user who last mapped it', () => {
    expect(isTaskSelfValidation({
      lastMapperId: 'mapper-1',
      status: 'ready_for_validation',
    }, 'mapper-1')).toBe(true);
  });

  it('does not block mapping tasks or a different validator', () => {
    expect(isTaskSelfValidation({
      lastMapperId: 'mapper-1',
      status: 'ready_for_mapping',
    }, 'mapper-1')).toBe(false);
    expect(isTaskSelfValidation({
      lastMapperId: 'mapper-1',
      status: 'ready_for_validation',
    }, 'validator-2')).toBe(false);
  });
});
