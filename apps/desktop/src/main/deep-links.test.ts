import { describe, expect, it } from 'vitest'
import { parseAuthDeepLink, parseOpenNoteDeepLink } from './deep-links'

describe('parseOpenNoteDeepLink', () => {
  it('parses encoded vault-relative paths', () => {
    expect(
      parseOpenNoteDeepLink('zennotes://open?path=hellointerview%2Fsystem%20design.md')
    ).toEqual({ target: 'tab', path: 'hellointerview/system design.md' })
  })

  it('parses floating window note links', () => {
    expect(
      parseOpenNoteDeepLink('zennotes://open-window?path=hellointerview%2Fsystem%20design.md')
    ).toEqual({ target: 'window', path: 'hellointerview/system design.md' })
  })

  it('parses single-slash action URLs', () => {
    expect(parseOpenNoteDeepLink('zennotes:/open?path=inbox%2Fdaily.md')).toEqual({
      target: 'tab',
      path: 'inbox/daily.md'
    })
  })

  it('normalizes duplicate separators', () => {
    expect(parseOpenNoteDeepLink('zennotes://open?path=inbox//daily.md')).toEqual({
      target: 'tab',
      path: 'inbox/daily.md'
    })
  })

  it('rejects unsupported schemes and actions', () => {
    expect(parseOpenNoteDeepLink('https://open?path=note.md')).toBeNull()
    expect(parseOpenNoteDeepLink('zennotes://settings')).toBeNull()
  })

  it('rejects empty or unsafe paths', () => {
    expect(parseOpenNoteDeepLink('zennotes://open')).toBeNull()
    expect(parseOpenNoteDeepLink('zennotes://open?path=%2Fetc%2Fpasswd')).toBeNull()
    expect(parseOpenNoteDeepLink('zennotes://open?path=..%2Fsecret.md')).toBeNull()
    expect(parseOpenNoteDeepLink('zennotes://open?path=notes%2F..%2Fsecret.md')).toBeNull()
    expect(parseOpenNoteDeepLink('zennotes://open?path=C%3A%2FUsers%2Fnote.md')).toBeNull()
  })

  it('ignores auth deep links', () => {
    expect(parseOpenNoteDeepLink('zennotes://auth?code=abc&state=xyz')).toBeNull()
  })
})

describe('parseAuthDeepLink', () => {
  it('parses code and state from auth links', () => {
    expect(parseAuthDeepLink('zennotes://auth?code=abc123&state=xyz789')).toEqual({
      code: 'abc123',
      state: 'xyz789'
    })
  })

  it('parses single-slash auth links', () => {
    expect(parseAuthDeepLink('zennotes:/auth?code=abc&state=xyz')).toEqual({
      code: 'abc',
      state: 'xyz'
    })
  })

  it('decodes url-encoded values', () => {
    expect(parseAuthDeepLink('zennotes://auth?code=a%2Bb&state=s%20t')).toEqual({
      code: 'a+b',
      state: 's t'
    })
  })

  it('rejects links missing code or state', () => {
    expect(parseAuthDeepLink('zennotes://auth?code=abc')).toBeNull()
    expect(parseAuthDeepLink('zennotes://auth?state=xyz')).toBeNull()
    expect(parseAuthDeepLink('zennotes://auth?code=&state=xyz')).toBeNull()
    expect(parseAuthDeepLink('zennotes://auth')).toBeNull()
  })

  it('rejects other schemes and actions', () => {
    expect(parseAuthDeepLink('https://auth?code=abc&state=xyz')).toBeNull()
    expect(parseAuthDeepLink('zennotes://open?path=note.md')).toBeNull()
    expect(parseAuthDeepLink('')).toBeNull()
    expect(parseAuthDeepLink('not a url')).toBeNull()
  })
})
