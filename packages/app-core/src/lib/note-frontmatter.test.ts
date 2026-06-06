import { describe, expect, it } from 'vitest'
import {
  readShareFrontmatter,
  removeShareFrontmatter,
  stripFrontmatter,
  upsertShareFrontmatter
} from './note-frontmatter'

const SHARE = { shareId: '42', shareUrl: 'https://zennotes.org/s/abc123def456' }

describe('readShareFrontmatter', () => {
  it('returns nulls when there is no frontmatter', () => {
    expect(readShareFrontmatter('# Hello\n')).toEqual({ shareId: null, shareUrl: null })
  })

  it('reads share keys from an existing block', () => {
    const body = '---\ntitle: Note\nshare_id: 42\nshare_url: https://x.test/s/a\n---\n# Hi\n'
    expect(readShareFrontmatter(body)).toEqual({
      shareId: '42',
      shareUrl: 'https://x.test/s/a'
    })
  })

  it('unquotes quoted values', () => {
    const body = '---\nshare_id: "42"\nshare_url: \'https://x.test/s/a\'\n---\nBody\n'
    expect(readShareFrontmatter(body)).toEqual({
      shareId: '42',
      shareUrl: 'https://x.test/s/a'
    })
  })

  it('ignores share-like keys outside the leading block', () => {
    const body = '# Title\n\n---\nshare_id: 42\n---\n'
    expect(readShareFrontmatter(body)).toEqual({ shareId: null, shareUrl: null })
  })
})

describe('upsertShareFrontmatter', () => {
  it('creates a frontmatter block when the note has none', () => {
    const next = upsertShareFrontmatter('# Hello\n\nBody.\n', SHARE)
    expect(next).toBe(
      '---\nshare_id: 42\nshare_url: https://zennotes.org/s/abc123def456\n---\n# Hello\n\nBody.\n'
    )
  })

  it('appends keys to an existing block without touching other lines', () => {
    const body = '---\ntitle: My Note\ntags: [a, b]\n---\n# Hello\n'
    const next = upsertShareFrontmatter(body, SHARE)
    expect(next).toBe(
      '---\ntitle: My Note\ntags: [a, b]\nshare_id: 42\nshare_url: https://zennotes.org/s/abc123def456\n---\n# Hello\n'
    )
  })

  it('replaces existing share keys in place', () => {
    const body = '---\nshare_id: old\ntitle: Keep\nshare_url: https://old.test\n---\nBody\n'
    const next = upsertShareFrontmatter(body, SHARE)
    expect(next).toBe(
      '---\nshare_id: 42\ntitle: Keep\nshare_url: https://zennotes.org/s/abc123def456\n---\nBody\n'
    )
  })

  it('is idempotent', () => {
    const once = upsertShareFrontmatter('# Hi\n', SHARE)
    expect(upsertShareFrontmatter(once, SHARE)).toBe(once)
  })

  it('preserves CRLF line endings', () => {
    const body = '---\r\ntitle: Win\r\n---\r\n# Hello\r\n'
    const next = upsertShareFrontmatter(body, SHARE)
    expect(next).toBe(
      '---\r\ntitle: Win\r\nshare_id: 42\r\nshare_url: https://zennotes.org/s/abc123def456\r\n---\r\n# Hello\r\n'
    )
  })

  it('preserves a BOM', () => {
    const body = '﻿# Hello\n'
    const next = upsertShareFrontmatter(body, SHARE)
    expect(next.startsWith('﻿---\n')).toBe(true)
    expect(next.endsWith('# Hello\n')).toBe(true)
  })

  it('strips injected newlines from values', () => {
    const next = upsertShareFrontmatter('# Hi\n', {
      shareId: '42\nevil: true',
      shareUrl: 'https://x.test'
    })
    expect(next).toContain('share_id: 42 evil: true\n')
    expect(readShareFrontmatter(next).shareId).toBe('42 evil: true')
  })
})

describe('removeShareFrontmatter', () => {
  it('removes only the share keys', () => {
    const body = '---\ntitle: Keep\nshare_id: 42\nshare_url: https://x.test\n---\nBody\n'
    expect(removeShareFrontmatter(body)).toBe('---\ntitle: Keep\n---\nBody\n')
  })

  it('drops the whole block when share keys were its only content', () => {
    const body = '---\nshare_id: 42\nshare_url: https://x.test\n---\n# Hello\n'
    expect(removeShareFrontmatter(body)).toBe('# Hello\n')
  })

  it('leaves notes without share keys untouched', () => {
    const body = '---\ntitle: Keep\n---\nBody\n'
    expect(removeShareFrontmatter(body)).toBe(body)
    expect(removeShareFrontmatter('# Plain\n')).toBe('# Plain\n')
  })
})

describe('stripFrontmatter', () => {
  it('removes a leading frontmatter block', () => {
    expect(stripFrontmatter('---\ntitle: X\n---\n# Hello\n')).toBe('# Hello\n')
  })

  it('returns the body unchanged when there is no block', () => {
    expect(stripFrontmatter('# Hello\n')).toBe('# Hello\n')
  })

  it('handles an unterminated block as plain content', () => {
    const body = '---\ntitle: X\n# Hello\n'
    expect(stripFrontmatter(body)).toBe(body)
  })

  it('handles CRLF blocks', () => {
    expect(stripFrontmatter('---\r\ntitle: X\r\n---\r\n# Hello\r\n')).toBe('# Hello\r\n')
  })
})
