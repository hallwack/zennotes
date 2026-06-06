// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { buildSharePayload } from './share-payload'

const ASSETS = [
  { path: 'media/photo.png' },
  { path: 'media/Pasted Image.png' },
  { path: 'inbox/diagram.svg' },
  { path: 'docs/manual.pdf' },
  { path: 'inbox/local.png' }
]

function payloadFor(body: string, notePath = 'inbox/Note.md') {
  return buildSharePayload({ path: notePath, title: 'Note', body }, ASSETS)
}

describe('buildSharePayload', () => {
  it('strips frontmatter from the public markdown', () => {
    const result = payloadFor('---\nshare_id: 1\n---\n# Hello\n')
    expect(result.markdown).toBe('# Hello\n')
    expect(result.notePath).toBe('inbox/Note.md')
    expect(result.title).toBe('Note')
  })

  it('collects tikz fences in order, deduped', () => {
    const body = [
      '```tikz',
      '\\begin{tikzpicture}A\\end{tikzpicture}',
      '```',
      '',
      '```tikz',
      '\\begin{tikzpicture}B\\end{tikzpicture}',
      '```',
      '',
      '```tikz',
      '\\begin{tikzpicture}A\\end{tikzpicture}',
      '```',
      '',
      '```mermaid',
      'graph TD',
      '```'
    ].join('\n')

    expect(payloadFor(body).tikzSources).toEqual([
      '\\begin{tikzpicture}A\\end{tikzpicture}',
      '\\begin{tikzpicture}B\\end{tikzpicture}'
    ])
  })

  it('collects standard image refs with resolved vault paths', () => {
    const result = payloadFor('![photo](media/photo.png)\n')
    expect(result.assets).toEqual([{ ref: 'media/photo.png', vaultRelPath: 'media/photo.png' }])
  })

  it('collects wikilink image embeds', () => {
    const result = payloadFor('![[photo.png]]\n')
    expect(result.assets).toEqual([{ ref: 'photo.png', vaultRelPath: 'media/photo.png' }])
  })

  it('decodes percent-escaped refs to their canonical form', () => {
    const result = payloadFor('![pasted](media/Pasted%20Image.png)\n')
    expect(result.assets).toEqual([
      { ref: 'media/Pasted Image.png', vaultRelPath: 'media/Pasted Image.png' }
    ])
  })

  it('collects embeddable link assets like pdfs', () => {
    const result = payloadFor('[the manual](docs/manual.pdf)\n')
    expect(result.assets).toEqual([{ ref: 'docs/manual.pdf', vaultRelPath: 'docs/manual.pdf' }])
  })

  it('skips external urls, svg assets, unresolved files, and plain note links', () => {
    const body = [
      '![remote](https://example.com/pic.png)',
      '![vector](diagram.svg)',
      '![missing](not-in-vault.png)',
      '[readme](README.md)',
      '[[Another Note]]'
    ].join('\n\n')

    expect(payloadFor(body).assets).toEqual([])
  })

  it('dedupes repeated refs', () => {
    const body = '![a](media/photo.png)\n\n![b](media/photo.png)\n'
    expect(payloadFor(body).assets).toHaveLength(1)
  })

  it('resolves note-dir-relative refs', () => {
    const result = payloadFor('![local](local.png)', 'inbox/Note.md')
    expect(result.assets).toEqual([{ ref: 'local.png', vaultRelPath: 'inbox/local.png' }])
  })
})
