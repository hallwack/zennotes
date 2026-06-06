import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const secretStore = vi.hoisted(() => {
  const secrets = new Map<string, string>()
  return {
    secrets,
    getRemoteWorkspaceSecret: vi.fn(async (id: string) => secrets.get(id) ?? null),
    setRemoteWorkspaceSecret: vi.fn(async (id: string, secret: string | null) => {
      if (secret) secrets.set(id, secret)
      else secrets.delete(id)
      return Boolean(secret)
    }),
    deleteRemoteWorkspaceSecret: vi.fn(async (id: string) => {
      secrets.delete(id)
    })
  }
})

vi.mock('../secret-store', () => secretStore)

import {
  beginShareConnect,
  completeShareConnect,
  disconnectShareAccount,
  getShareAccount,
  getShareServerUrl,
  resetShareAccountStateForTests,
  setShareServerUrl,
  type ShareAccountDeps
} from './share-account'

const fetchMock = vi.fn()
const openExternal = vi.fn(async () => {})

function makeDeps(): ShareAccountDeps {
  const dir = mkdtempSync(path.join(tmpdir(), 'zen-share-account-'))
  return {
    getUserDataPath: () => dir,
    getClientVersion: () => '0.0.0-test',
    openExternal
  }
}

let deps: ShareAccountDeps

beforeEach(() => {
  resetShareAccountStateForTests()
  secretStore.secrets.clear()
  fetchMock.mockReset()
  openExternal.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  deps = makeDeps()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function exchangeSucceedsWith(token = 'tok-1'): void {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ token, user: { name: 'Adib', email: 'adib@test.dev' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  )
}

describe('share account connect flow', () => {
  it('begins a connect by opening the browser with a state nonce', async () => {
    const pending = await beginShareConnect(deps)

    expect(pending.state).toMatch(/^[0-9a-f-]{36}$/)
    expect(pending.url).toBe(
      `https://zennotes.org/app/connect?state=${encodeURIComponent(pending.state)}`
    )
    expect(openExternal).toHaveBeenCalledWith(pending.url)
  })

  it('completes the flow when the deep link state matches', async () => {
    exchangeSucceedsWith('tok-deep')
    const pending = await beginShareConnect(deps)

    const account = await completeShareConnect(deps, 'code-1', pending.state)

    expect(account).toMatchObject({
      connected: true,
      name: 'Adib',
      email: 'adib@test.dev'
    })
    expect(secretStore.secrets.get('share-account-token')).toBe('tok-deep')
  })

  it('completes the flow with a manually pasted code (no explicit state)', async () => {
    exchangeSucceedsWith()
    await beginShareConnect(deps)

    const account = await completeShareConnect(deps, '  code-2  ', null)

    expect(account.connected).toBe(true)
    // The exchange used the pending nonce.
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body.code).toBe('code-2')
    expect(body.state).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('rejects a state mismatch', async () => {
    await beginShareConnect(deps)

    await expect(completeShareConnect(deps, 'code', 'wrong-state')).rejects.toThrow(
      /does not match the pending connect attempt/
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects when no connect attempt is pending', async () => {
    await expect(completeShareConnect(deps, 'code', null)).rejects.toThrow(
      /No connect attempt is in progress/
    )
  })

  it('consumes the pending nonce on success', async () => {
    exchangeSucceedsWith()
    const pending = await beginShareConnect(deps)
    await completeShareConnect(deps, 'code', pending.state)

    await expect(completeShareConnect(deps, 'code', pending.state)).rejects.toThrow(
      /No connect attempt is in progress/
    )
  })

  it('disconnect clears the token and identity but keeps the server url', async () => {
    exchangeSucceedsWith()
    await setShareServerUrl(deps, 'http://zennotes.test')
    const pending = await beginShareConnect(deps)
    await completeShareConnect(deps, 'code', pending.state)

    const account = await disconnectShareAccount(deps)

    expect(account).toEqual({
      connected: false,
      name: null,
      email: null,
      serverUrl: 'http://zennotes.test'
    })
    expect(secretStore.secrets.has('share-account-token')).toBe(false)
  })

  it('reports a disconnected account by default', async () => {
    expect(await getShareAccount(deps)).toEqual({
      connected: false,
      name: null,
      email: null,
      serverUrl: 'https://zennotes.org'
    })
  })

  it('normalizes and persists the server url override', async () => {
    expect(await setShareServerUrl(deps, 'zennotes.test/')).toBe('https://zennotes.test')
    expect(await getShareServerUrl(deps)).toBe('https://zennotes.test')

    // Empty resets to the default.
    expect(await setShareServerUrl(deps, '  ')).toBe('https://zennotes.org')
  })
})
