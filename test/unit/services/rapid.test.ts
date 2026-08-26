import { describe, expect, it, vi } from 'vitest';
import { RapidManager } from '~/services/rapid';

import type { TdeiAuthStore } from '~/services/tdei';

describe('RapidManager subscriptions', () => {
  it('stops notifying page callbacks after their cleanup functions run', async () => {
    let stableChangeHandler: (() => void) | undefined;
    let uploadResultHandler: ((result: unknown) => void) | undefined;
    const manager = new RapidManager(
      '/rapid/',
      'https://www.openstreetmap.org/',
      { ok: true } as TdeiAuthStore,
    );
    manager.rapidContext = {
      initAsync: vi.fn().mockResolvedValue(undefined),
      resetAsync: vi.fn().mockResolvedValue(undefined),
      services: {
        osm: {
          _oauth: {
            authenticated: vi.fn(),
            fetch: vi.fn(),
          },
          userDetails: vi.fn(),
        },
      },
      systems: {
        urlhash: {
          initialHashParams: new Map<string, string>(),
        },
        editor: {
          changes: () => ({ created: [], deleted: [], modified: [{}] }),
          on: (_event: string, handler: () => void) => {
            stableChangeHandler = handler;
          },
        },
        uploader: {
          on: (_event: string, handler: (result: unknown) => void) => {
            uploadResultHandler = handler;
          },
        },
      },
    };

    const stateCallback = vi.fn();
    const uploadCallback = vi.fn();
    const stopStateChanges = manager.onStateChange(stateCallback);
    const stopUploadResults = manager.onUploadResult(uploadCallback);

    await manager.init(1763);
    stableChangeHandler?.();
    uploadResultHandler?.({ id: 123 });

    expect(stateCallback).toHaveBeenCalledOnce();
    expect(uploadCallback).toHaveBeenCalledOnce();

    stopStateChanges();
    stopUploadResults();
    stableChangeHandler?.();
    uploadResultHandler?.({ id: 456 });

    expect(stateCallback).toHaveBeenCalledOnce();
    expect(uploadCallback).toHaveBeenCalledOnce();
  });

  it('replaces the initial changeset hashtag when initializing another task', async () => {
    const initialHashParams = new Map<string, string>([
      ['hashtags', '#tm-39-1'],
    ]);
    const rapidContext = {
      initAsync: vi.fn(),
      resetAsync: vi.fn().mockImplementation(async () => {
        initialHashParams.delete('hashtags');
      }),
      services: {
        osm: {
          _oauth: {
            authenticated: vi.fn(),
            fetch: vi.fn(),
          },
          userDetails: vi.fn(),
        },
      },
      systems: {} as Record<string, unknown>,
    };

    rapidContext.initAsync.mockImplementation(async () => {
      await Promise.resolve();
      rapidContext.systems = {
        urlhash: { initialHashParams },
        editor: {
          changes: () => ({ created: [], deleted: [], modified: [] }),
          on: vi.fn(),
        },
        uploader: { on: vi.fn() },
      };
    });

    const manager = new RapidManager(
      '/rapid/',
      'https://www.openstreetmap.org/',
      { ok: true } as TdeiAuthStore,
    );
    manager.rapidContext = rapidContext;

    await manager.init(1763, null, '#tm-39-2');

    expect(initialHashParams.get('hashtags')).toBe('#tm-39-2');

    await manager.switchWorkspace(1763, null, '#tm-39-3');

    expect(initialHashParams.get('hashtags')).toBe('#tm-39-3');
  });
});
