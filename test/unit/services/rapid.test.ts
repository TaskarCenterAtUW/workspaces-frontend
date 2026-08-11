import { afterEach, describe, expect, it, vi } from 'vitest';
import { RapidManager } from '~/services/rapid';

import type { ImagerySource } from '~/types/imagery';
import type { TdeiAuthStore } from '~/services/tdei';

describe('RapidManager subscriptions', () => {
  afterEach(() => {
    document.head.querySelectorAll('link[href="/rapid/rapid.css"]').forEach(element => element.remove());
    document.body.querySelectorAll('script[src="/rapid/rapid.js"]').forEach(element => element.remove());
    vi.unstubAllGlobals();
  });

  it('removes project imagery when switching to a project without custom imagery', async () => {
    const defaultSource = { id: 'Bing' };
    const sources = new Map<string, unknown>([['bing', defaultSource]]);
    let activeSource: unknown = defaultSource;
    const imagerySystem = {
      _imageryIndex: { sources },
      baseLayerSource: vi.fn((source?: unknown) => {
        if (source) {
          activeSource = source;
        }
        return activeSource;
      }),
      chooseDefaultSource: vi.fn(() => defaultSource),
      setSourceByID: vi.fn((id: string) => {
        activeSource = sources.get(id.toLowerCase());
      }),
    };
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
        imagery: imagerySystem,
        urlhash: { initialHashParams: new Map<string, string>() },
        editor: {
          changes: () => ({ created: [], deleted: [], modified: [] }),
          on: vi.fn(),
        },
        uploader: { on: vi.fn() },
      },
    };
    vi.stubGlobal('Rapid', {
      ImagerySource: class {
        readonly isProjectImagery = true;

        constructor(_context: unknown, source: object) {
          Object.assign(this, source);
        }
      },
    });
    const projectImagery: ImagerySource = {
      attribution: {
        required: false,
        text: 'Project imagery',
        url: 'https://imagery.example',
      },
      description: 'Project imagery',
      extent: { max_zoom: 22, polygon: [] },
      icon: '',
      id: 'Project-Imagery',
      name: 'Project imagery',
      type: 'xyz',
      url: 'https://imagery.example/{z}/{x}/{y}.png',
    };

    await manager.init(1763, projectImagery);
    expect(sources.has('project-imagery')).toBe(true);

    await manager.switchWorkspace(1764);

    expect(sources.has('project-imagery')).toBe(false);
    expect(activeSource).toBe(defaultSource);
  });

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
        urlhash: { initialHashParams },
        editor: {
          changes: () => ({ created: [], deleted: [], modified: [] }),
          on: vi.fn(),
        },
        uploader: { on: vi.fn() },
      },
    };

    await manager.init(1763, null, '#tm-39-2');

    expect(initialHashParams.get('hashtags')).toBe('#tm-39-2');

    await manager.switchWorkspace(1763, null, '#tm-39-3');

    expect(initialHashParams.get('hashtags')).toBe('#tm-39-3');
  });
});
