import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { DEFAULT_SHARE_SERVER_URL, type ShareAccount, type ShareConnectPending } from '@shared/ipc'
import {
  deleteRemoteWorkspaceSecret,
  getRemoteWorkspaceSecret,
  setRemoteWorkspaceSecret
} from '../secret-store'
import { normalizeShareServerUrl, ShareServerClient } from './share-client'

/** Keychain id (piggybacks on the existing remote-workspace store). */
const TOKEN_SECRET_ID = 'share-account-token'
const ACCOUNT_FILE = 'share-account.json'
/** How long a begin-connect nonce stays valid. */
const PENDING_TTL_MS = 10 * 60 * 1000

interface ShareAccountFile {
  name: string | null
  email: string | null
  serverUrl: string
}

export interface ShareAccountDeps {
  getUserDataPath(): string
  getClientVersion(): string
  openExternal(url: string): Promise<void>
}

interface PendingConnect {
  state: string
  createdAt: number
}

let pending: PendingConnect | null = null
let cachedAccount: ShareAccountFile | null = null

function accountFilePath(deps: ShareAccountDeps): string {
  return path.join(deps.getUserDataPath(), ACCOUNT_FILE)
}

async function loadAccountFile(deps: ShareAccountDeps): Promise<ShareAccountFile> {
  if (cachedAccount) return cachedAccount
  try {
    const raw = await fs.readFile(accountFilePath(deps), 'utf8')
    const parsed = JSON.parse(raw) as Partial<ShareAccountFile>
    cachedAccount = {
      name: typeof parsed.name === 'string' ? parsed.name : null,
      email: typeof parsed.email === 'string' ? parsed.email : null,
      serverUrl:
        typeof parsed.serverUrl === 'string' && parsed.serverUrl.trim()
          ? normalizeShareServerUrl(parsed.serverUrl)
          : DEFAULT_SHARE_SERVER_URL
    }
  } catch {
    cachedAccount = { name: null, email: null, serverUrl: DEFAULT_SHARE_SERVER_URL }
  }
  return cachedAccount
}

async function saveAccountFile(deps: ShareAccountDeps, next: ShareAccountFile): Promise<void> {
  cachedAccount = next
  await fs.mkdir(path.dirname(accountFilePath(deps)), { recursive: true })
  await fs.writeFile(accountFilePath(deps), JSON.stringify(next, null, 2), 'utf8')
}

export async function getShareToken(): Promise<string | null> {
  return getRemoteWorkspaceSecret(TOKEN_SECRET_ID)
}

export async function getShareAccount(deps: ShareAccountDeps): Promise<ShareAccount> {
  const file = await loadAccountFile(deps)
  const token = await getShareToken()
  return {
    connected: Boolean(token),
    name: token ? file.name : null,
    email: token ? file.email : null,
    serverUrl: file.serverUrl
  }
}

export async function getShareServerUrl(deps: ShareAccountDeps): Promise<string> {
  const override = process.env.ZENNOTES_SHARE_SERVER_URL?.trim()
  if (override) return normalizeShareServerUrl(override)
  return (await loadAccountFile(deps)).serverUrl
}

export async function setShareServerUrl(deps: ShareAccountDeps, url: string): Promise<string> {
  const file = await loadAccountFile(deps)
  const serverUrl = url.trim() ? normalizeShareServerUrl(url) : DEFAULT_SHARE_SERVER_URL
  await saveAccountFile(deps, { ...file, serverUrl })
  return serverUrl
}

/**
 * Start the browser connect handoff: mint a state nonce, remember it,
 * and open the server's authorize page in the default browser.
 */
export async function beginShareConnect(deps: ShareAccountDeps): Promise<ShareConnectPending> {
  const state = randomUUID()
  pending = { state, createdAt: Date.now() }

  const serverUrl = await getShareServerUrl(deps)
  const url = `${serverUrl}/app/connect?state=${encodeURIComponent(state)}`
  await deps.openExternal(url)

  return { state, url }
}

function currentPending(): PendingConnect | null {
  if (!pending) return null
  if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
    pending = null
    return null
  }
  return pending
}

/**
 * Complete the connect flow with a one-time code — either delivered via
 * the zennotes://auth deep link (which carries the state to verify) or
 * pasted manually into Settings (state implied by the pending nonce).
 */
export async function completeShareConnect(
  deps: ShareAccountDeps,
  code: string,
  state: string | null
): Promise<ShareAccount> {
  const current = currentPending()
  if (!current) {
    throw new Error(
      'No connect attempt is in progress. Use "Connect via browser" first, then paste the code.'
    )
  }
  if (state !== null && current.state !== state) {
    throw new Error(
      'This sign-in link does not match the pending connect attempt. Start the connection again from Settings → Sharing.'
    )
  }

  const trimmedCode = code.trim()
  if (!trimmedCode) {
    throw new Error('Paste the one-time code shown in the browser.')
  }

  const client = new ShareServerClient({
    baseUrl: await getShareServerUrl(deps),
    clientVersion: deps.getClientVersion()
  })
  const result = await client.exchange(trimmedCode, current.state)

  pending = null
  await setRemoteWorkspaceSecret(TOKEN_SECRET_ID, result.token)

  const file = await loadAccountFile(deps)
  await saveAccountFile(deps, {
    ...file,
    name: result.user?.name ?? null,
    email: result.user?.email ?? null
  })

  return getShareAccount(deps)
}

export async function disconnectShareAccount(deps: ShareAccountDeps): Promise<ShareAccount> {
  pending = null
  await deleteRemoteWorkspaceSecret(TOKEN_SECRET_ID)

  const file = await loadAccountFile(deps)
  await saveAccountFile(deps, { ...file, name: null, email: null })

  return getShareAccount(deps)
}

/** Build an authenticated client, or explain how to connect first. */
export async function requireShareClient(deps: ShareAccountDeps): Promise<ShareServerClient> {
  const token = await getShareToken()
  if (!token) {
    throw new Error(
      'Connect your ZenNotes account first: Settings → Sharing → Connect via browser.'
    )
  }
  return new ShareServerClient({
    baseUrl: await getShareServerUrl(deps),
    token,
    clientVersion: deps.getClientVersion()
  })
}

/** Test hook: clear module state between specs. */
export function resetShareAccountStateForTests(): void {
  pending = null
  cachedAccount = null
}
