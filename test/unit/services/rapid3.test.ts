import { describe, expect, it, vi } from 'vitest'
import { Rapid3Manager } from '~/services/rapid3'

import type { TdeiAuthStore } from '~/services/tdei'

function createRapidContext() {
  let stableChangeHandler: (() => void) | undefined
  let uploadResultHandler: ((result: unknown) => void) | undefined
  let requestInterceptor: ((url: string | URL, init: RequestInit) => RequestInit) | undefined
  const initialHashParams = new Map<string, string>()

  const context = {
    initAsync: vi.fn().mockResolvedValue(undefined),
    startAsync: vi.fn().mockResolvedValue(undefined),
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
      network: {
        addRequestInterceptor: (interceptor: (url: string | URL, init: RequestInit) => RequestInit) => {
          requestInterceptor = interceptor
        },
      },
      urlhash: { initialHashParams },
      editor: {
        changes: () => ({ created: [], deleted: [], modified: [{}] }),
        on: (_event: string, handler: () => void) => {
          stableChangeHandler = handler
        },
      },
      uploader: {
        on: (_event: string, handler: (result: unknown) => void) => {
          uploadResultHandler = handler
        },
      },
    },
  }

  return {
    context,
    initialHashParams,
    stableChange: () => stableChangeHandler?.(),
    uploadResult: (result: unknown) => uploadResultHandler?.(result),
    interceptRequest: (url: string | URL, init: RequestInit = {}) => requestInterceptor?.(url, init),
  }
}

describe('Rapid3Manager tasking manager integration', () => {
  it('notifies subscribers and stops after their cleanup functions run', async () => {
    const rapid = createRapidContext()
    const manager = new Rapid3Manager(
      '/rapid3/',
      'https://www.openstreetmap.org/',
      { ok: true } as TdeiAuthStore,
    )
    manager.rapidContext = rapid.context

    const stateCallback = vi.fn()
    const uploadCallback = vi.fn()
    const stopStateChanges = manager.onStateChange(stateCallback)
    const stopUploadResults = manager.onUploadResult(uploadCallback)

    await manager.init(1763)
    rapid.stableChange()
    rapid.uploadResult({ id: 123 })

    expect(stateCallback).toHaveBeenCalledWith(1)
    expect(uploadCallback).toHaveBeenCalledWith({ id: 123 })

    stopStateChanges()
    stopUploadResults()
    rapid.stableChange()
    rapid.uploadResult({ id: 456 })

    expect(stateCallback).toHaveBeenCalledOnce()
    expect(uploadCallback).toHaveBeenCalledOnce()
  })

  it('restores the task hashtag after initialization and workspace reset', async () => {
    const rapid = createRapidContext()
    rapid.context.initAsync.mockImplementation(async () => {
      rapid.initialHashParams.delete('hashtags')
    })
    rapid.context.resetAsync.mockImplementation(async () => {
      rapid.initialHashParams.delete('hashtags')
    })

    const manager = new Rapid3Manager(
      '/rapid3/',
      'https://www.openstreetmap.org/',
      { ok: true } as TdeiAuthStore,
    )
    manager.rapidContext = rapid.context

    await manager.init(1763, null, '#tm-39-2')
    expect(rapid.initialHashParams.get('hashtags')).toBe('#tm-39-2')

    await manager.switchWorkspace(1763, null, '#tm-39-3')
    expect(rapid.initialHashParams.get('hashtags')).toBe('#tm-39-3')
  })

  it('authenticates OSM requests before initialization', async () => {
    const rapid = createRapidContext()
    const manager = new Rapid3Manager(
      '/rapid3/',
      '/osm/',
      { ok: true, accessToken: 'test-token' } as TdeiAuthStore,
    )
    manager.rapidContext = rapid.context
    rapid.context.initAsync.mockImplementation(async () => {
      expect(rapid.interceptRequest('/osm/api/0.6/map', {})).toEqual({
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Workspace': '1763',
        },
      })
    })

    await manager.init(1763)

    expect(rapid.interceptRequest('/osm/api/0.6/map', {})).toEqual({
      headers: {
        'Authorization': 'Bearer test-token',
        'X-Workspace': '1763',
      },
    })
    expect(rapid.interceptRequest('https://tiles.example.test/1/2/3.png', {})).toEqual({})
  })
})
