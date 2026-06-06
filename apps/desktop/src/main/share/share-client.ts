import type { ShareRecord } from '@shared/ipc'

export interface ShareServerClientOptions {
  baseUrl: string
  token?: string | null
  /** Sent as X-ZenNotes-Client so the server can reason about versions. */
  clientVersion?: string | null
}

export interface ShareExchangeResult {
  token: string
  user: { name: string; email: string }
}

/** One uploadable asset: the markdown ref plus its raw bytes. */
export interface ShareUploadAsset {
  ref: string
  bytes: Uint8Array
  mimeType?: string | null
}

export interface ShareUploadBody {
  notePath: string
  title: string
  markdown: string
  tikzSvgs: { hash: string; svg: string }[]
  assets: ShareUploadAsset[]
}

interface ShareRecordWire {
  id: number
  slug: string
  url: string
  title?: string | null
  note_path?: string | null
  view_count?: number
  updated_at?: string | null
}

type JsonRequestInit = Omit<RequestInit, 'body'> & { body?: unknown }

/**
 * HTTP client for the zennotes.org share API. Modeled on
 * `RemoteServerClient` — native fetch, Bearer auth, friendly errors —
 * plus multipart uploads for publish/republish.
 */
export class ShareServerClient {
  readonly baseUrl: string
  readonly token: string | null
  readonly clientVersion: string | null

  constructor(options: ShareServerClientOptions) {
    this.baseUrl = normalizeShareServerUrl(options.baseUrl)
    this.token = options.token?.trim() || null
    this.clientVersion = options.clientVersion?.trim() || null
  }

  /** Exchange a one-time connect code for a personal access token. */
  async exchange(code: string, state: string): Promise<ShareExchangeResult> {
    return this.jsonRequest<ShareExchangeResult>('/api/v1/app/exchange', {
      method: 'POST',
      body: { code, state }
    })
  }

  async createShare(body: ShareUploadBody): Promise<ShareRecord> {
    const record = await this.multipartRequest<ShareRecordWire>('/api/v1/shares', 'POST', body)
    return toShareRecord(record)
  }

  async updateShare(shareId: number, body: ShareUploadBody): Promise<ShareRecord> {
    const record = await this.multipartRequest<ShareRecordWire>(
      `/api/v1/shares/${shareId}`,
      'PUT',
      body
    )
    return toShareRecord(record)
  }

  async deleteShare(shareId: number): Promise<void> {
    await this.jsonRequest<void>(`/api/v1/shares/${shareId}`, { method: 'DELETE' })
  }

  async listShares(): Promise<ShareRecord[]> {
    const response = await this.jsonRequest<{ data: ShareRecordWire[] }>('/api/v1/shares')
    return (response.data ?? []).map(toShareRecord)
  }

  private buildForm(body: ShareUploadBody): FormData {
    const form = new FormData()
    form.append(
      'payload',
      JSON.stringify({
        note_path: body.notePath,
        title: body.title,
        markdown: body.markdown,
        tikz_svgs: body.tikzSvgs,
        // Ordered to match the assets[] parts below — the server zips
        // them by index because multipart filenames get basenamed.
        asset_refs: body.assets.map((asset) => asset.ref)
      })
    )
    for (const asset of body.assets) {
      const filename = asset.ref.split('/').pop() || 'asset'
      const buffer = asset.bytes.buffer.slice(
        asset.bytes.byteOffset,
        asset.bytes.byteOffset + asset.bytes.byteLength
      ) as ArrayBuffer
      form.append(
        'assets[]',
        new File([buffer], filename, { type: asset.mimeType ?? 'application/octet-stream' })
      )
    }
    return form
  }

  private async multipartRequest<T>(
    path: string,
    method: 'POST' | 'PUT',
    body: ShareUploadBody
  ): Promise<T> {
    const headers = this.baseHeaders()
    // No explicit Content-Type: fetch derives the multipart boundary.
    const response = await this.send(path, { method, headers, body: this.buildForm(body) })
    return (await response.json()) as T
  }

  private async jsonRequest<T>(path: string, init?: JsonRequestInit): Promise<T> {
    const headers = this.baseHeaders(init?.headers)
    const hasBody = init?.body !== undefined
    if (hasBody && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    headers.set('Accept', 'application/json')

    const response = await this.send(path, {
      ...init,
      headers,
      body: hasBody ? JSON.stringify(init!.body) : undefined
    })
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  private baseHeaders(extra?: RequestInit['headers']): Headers {
    const headers = new Headers(extra)
    if (this.token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.token}`)
    }
    if (this.clientVersion) {
      headers.set('X-ZenNotes-Client', this.clientVersion)
    }
    if (!headers.has('Accept')) headers.set('Accept', 'application/json')
    return headers
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, init)
    } catch (error) {
      const message =
        error instanceof Error && error.message ? ` (${error.message})` : ''
      throw new ShareRequestError(
        `Could not reach the share server at ${this.baseUrl}.${message} Check the server URL in Settings → Sharing and your connection.`,
        0
      )
    }

    if (!response.ok) {
      throw new ShareRequestError(await describeFailure(response), response.status)
    }

    return response
  }
}

export class ShareRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'ShareRequestError'
  }
}

async function describeFailure(response: Response): Promise<string> {
  const detail = await response
    .json()
    .then((body: unknown) => {
      if (body && typeof body === 'object' && 'message' in body) {
        const message = (body as { message?: unknown }).message
        return typeof message === 'string' ? message : ''
      }
      return ''
    })
    .catch(() => '')

  if (response.status === 401) {
    return 'The share server rejected your token. Reconnect your account in Settings → Sharing.'
  }
  if (response.status === 404) {
    return detail || 'That share no longer exists on the server.'
  }
  if (response.status === 422) {
    return detail || 'The share server rejected the note (validation failed).'
  }
  if (response.status === 429) {
    return 'The share server is rate limiting requests. Try again in a minute.'
  }
  return detail || `Share server request failed (${response.status} ${response.statusText}).`
}

function toShareRecord(wire: ShareRecordWire): ShareRecord {
  return {
    id: wire.id,
    slug: wire.slug,
    url: wire.url,
    title: wire.title ?? null,
    notePath: wire.note_path ?? null,
    viewCount: wire.view_count,
    updatedAt: wire.updated_at ?? null
  }
}

export function normalizeShareServerUrl(value: string): string {
  const trimmed = value.trim()
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return normalized.replace(/\/+$/, '')
}
