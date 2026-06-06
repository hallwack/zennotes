import path from 'node:path'

export const ZENNOTES_DEEP_LINK_SCHEME = 'zennotes'

export type OpenNoteDeepLinkTarget = 'tab' | 'window'

export interface OpenNoteDeepLinkRequest {
  target: OpenNoteDeepLinkTarget
  path: string
}

const OPEN_NOTE_ACTION_TARGETS: Record<string, OpenNoteDeepLinkTarget> = {
  open: 'tab',
  'open-window': 'window'
}

export function parseOpenNoteDeepLink(rawUrl: string): OpenNoteDeepLinkRequest | null {
  const trimmed = rawUrl.trim()
  if (!trimmed) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  if (parsed.protocol !== `${ZENNOTES_DEEP_LINK_SCHEME}:`) return null

  const action = parsed.hostname || parsed.pathname.replace(/^\/+/, '')
  const target = OPEN_NOTE_ACTION_TARGETS[action]
  if (!target) return null

  const notePath = normalizeDeepLinkNotePath(parsed.searchParams.get('path'))
  return notePath ? { target, path: notePath } : null
}

export interface AuthDeepLinkRequest {
  code: string
  state: string
}

/**
 * Parse a `zennotes://auth?code=…&state=…` deep link sent back by the
 * share-server connect page. Returns null for anything else; the caller
 * falls through to the open-note parser.
 */
export function parseAuthDeepLink(rawUrl: string): AuthDeepLinkRequest | null {
  const trimmed = rawUrl.trim()
  if (!trimmed) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  if (parsed.protocol !== `${ZENNOTES_DEEP_LINK_SCHEME}:`) return null

  const action = parsed.hostname || parsed.pathname.replace(/^\/+/, '')
  if (action !== 'auth') return null

  const code = parsed.searchParams.get('code')?.trim() ?? ''
  const state = parsed.searchParams.get('state')?.trim() ?? ''
  if (!code || !state) return null

  return { code, state }
}

export function normalizeDeepLinkNotePath(rawPath: string | null | undefined): string | null {
  const trimmed = rawPath?.trim()
  if (!trimmed || trimmed.includes('\0')) return null

  const slashPath = trimmed.replace(/\\/g, '/')
  if (slashPath.startsWith('/') || /^[a-zA-Z]:\//.test(slashPath)) return null
  if (slashPath.split('/').some((part) => part === '..')) return null

  const normalized = path.posix.normalize(slashPath)
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null
  if (path.posix.isAbsolute(normalized)) return null

  return normalized
}
