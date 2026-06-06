import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeShareServerUrl,
  ShareRequestError,
  ShareServerClient,
  type ShareUploadBody
} from './share-client'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function uploadBody(overrides: Partial<ShareUploadBody> = {}): ShareUploadBody {
  return {
    notePath: 'inbox/Note.md',
    title: 'Note',
    markdown: '# Hi',
    tikzSvgs: [{ hash: 'abc', svg: '<svg/>' }],
    assets: [
      { ref: 'media/photo.png', bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' },
      { ref: 'song.mp3', bytes: new Uint8Array([4, 5]), mimeType: 'audio/mpeg' }
    ],
    ...overrides
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function client(token: string | null = 'tok-123'): ShareServerClient {
  return new ShareServerClient({
    baseUrl: 'https://zennotes.test',
    token,
    clientVersion: '9.9.9'
  })
}

describe('ShareServerClient', () => {
  it('sends bearer and client headers', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }))

    await client().listShares()

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://zennotes.test/api/v1/shares')
    const headers = init.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer tok-123')
    expect(headers.get('X-ZenNotes-Client')).toBe('9.9.9')
    expect(headers.get('Accept')).toBe('application/json')
  })

  it('exchanges a code without a bearer token', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ token: 'fresh', user: { name: 'Adib', email: 'a@b.c' } })
    )

    const result = await client(null).exchange('code-1', 'state-1')

    expect(result.token).toBe('fresh')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://zennotes.test/api/v1/app/exchange')
    expect(init.method).toBe('POST')
    expect((init.headers as Headers).get('Authorization')).toBeNull()
    expect(JSON.parse(init.body as string)).toEqual({ code: 'code-1', state: 'state-1' })
  })

  it('creates shares with a multipart body whose refs match asset order', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 7, slug: 'abc', url: 'https://x/s/abc' }, 201))

    const record = await client().createShare(uploadBody())

    expect(record).toMatchObject({ id: 7, slug: 'abc', url: 'https://x/s/abc' })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://zennotes.test/api/v1/shares')
    expect(init.method).toBe('POST')

    const form = init.body as FormData
    expect(form).toBeInstanceOf(FormData)

    const payload = JSON.parse(form.get('payload') as string)
    expect(payload.note_path).toBe('inbox/Note.md')
    expect(payload.tikz_svgs).toEqual([{ hash: 'abc', svg: '<svg/>' }])
    expect(payload.asset_refs).toEqual(['media/photo.png', 'song.mp3'])

    const files = form.getAll('assets[]') as File[]
    expect(files).toHaveLength(2)
    // Part filenames are basenames (the server zips by index, not name).
    expect(files[0]!.name).toBe('photo.png')
    expect(files[1]!.name).toBe('song.mp3')
    expect(files[0]!.type).toBe('image/png')

    // Content-Type must be left to fetch so the boundary is set.
    const headers = init.headers as Headers
    expect(headers.get('Content-Type')).toBeNull()
  })

  it('updates shares via PUT to the share id', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 7, slug: 'abc', url: 'https://x/s/abc' }))

    await client().updateShare(7, uploadBody())

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://zennotes.test/api/v1/shares/7')
    expect(init.method).toBe('PUT')
  })

  it('treats 204 as success for delete', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(client().deleteShare(7)).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://zennotes.test/api/v1/shares/7')
    expect(init.method).toBe('DELETE')
  })

  it('maps error statuses to friendly ShareRequestErrors', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'nope' }, 404))

    const error = await client()
      .deleteShare(9)
      .catch((err: unknown) => err)

    expect(error).toBeInstanceOf(ShareRequestError)
    expect((error as ShareRequestError).status).toBe(404)
  })

  it('explains connection failures', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))

    await expect(client().listShares()).rejects.toThrow(/Could not reach the share server/)
  })
})

describe('normalizeShareServerUrl', () => {
  it('defaults to https and strips trailing slashes', () => {
    expect(normalizeShareServerUrl('zennotes.org/')).toBe('https://zennotes.org')
    expect(normalizeShareServerUrl('http://zennotes.test//')).toBe('http://zennotes.test')
    expect(normalizeShareServerUrl(' https://x.dev ')).toBe('https://x.dev')
  })
})
