import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useWorkspaceCreateCheck } from '~/composables/useWorkspaceCreateCheck';

const checkWorkspaceCreate = vi.hoisted(() => vi.fn());

vi.mock('~/services/index', () => ({
  workspacesClient: {
    checkWorkspaceCreate,
  },
}));

const PG_ID = '11111111-1111-4111-8111-111111111111';
const DATASET_ID = '22222222-2222-4222-8222-222222222222';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('useWorkspaceCreateCheck', () => {
  beforeEach(() => {
    checkWorkspaceCreate.mockReset();
  });

  it('has no reason when the backend allows the create', async () => {
    checkWorkspaceCreate.mockResolvedValue({ canCreate: true });
    const { reason } = useWorkspaceCreateCheck(ref('osw'), ref(PG_ID));
    await settle();

    expect(checkWorkspaceCreate).toHaveBeenCalledWith({ type: 'osw', tdeiProjectGroupId: PG_ID });
    expect(reason.value).toBeNull();
  });

  it('reports the backend\'s reason when it says no', async () => {
    checkWorkspaceCreate.mockResolvedValue({ canCreate: false, reason: 'Not allowed' });
    const { reason } = useWorkspaceCreateCheck(ref('osw'), ref(PG_ID));
    await settle();

    expect(reason.value).toBe('Not allowed');
  });

  it('does not block when the check itself fails', async () => {
    checkWorkspaceCreate.mockRejectedValue(new Error('502'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { reason } = useWorkspaceCreateCheck(ref('osw'), ref(PG_ID));
    await settle();

    expect(reason.value).toBeNull();
  });

  it('waits for the dataset when one is expected, then sends it with a normalized type', async () => {
    checkWorkspaceCreate.mockResolvedValue({ canCreate: true });
    const recordId = ref<string | null>(null);
    useWorkspaceCreateCheck(ref(' OSW '), ref(PG_ID), recordId);
    await settle();
    expect(checkWorkspaceCreate).not.toHaveBeenCalled();

    recordId.value = DATASET_ID;
    await settle();
    expect(checkWorkspaceCreate).toHaveBeenCalledWith({
      type: 'osw',
      tdeiProjectGroupId: PG_ID,
      tdeiRecordId: DATASET_ID,
    });
  });

  it('ignores an answer that arrives after the inputs changed', async () => {
    let resolveFirst!: (v: unknown) => void;
    checkWorkspaceCreate
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ canCreate: true });
    const type = ref('osw');
    const { reason } = useWorkspaceCreateCheck(type, ref(PG_ID));

    type.value = 'flex';
    await settle();
    resolveFirst({ canCreate: false, reason: 'stale' });
    await settle();

    expect(reason.value).toBeNull();
  });
});
