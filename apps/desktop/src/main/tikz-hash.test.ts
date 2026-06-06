import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { tikzHash } from './tikz'

describe('tikzHash', () => {
  it('is sha1-hex of the raw fence body (the viewer-side contract)', () => {
    const source = '\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}'

    expect(tikzHash(source)).toBe(createHash('sha1').update(source).digest('hex'))
    expect(tikzHash(source)).toMatch(/^[0-9a-f]{40}$/)
  })

  it('does not trim or normalize the source', () => {
    expect(tikzHash(' a ')).not.toBe(tikzHash('a'))
    expect(tikzHash('a\n')).not.toBe(tikzHash('a'))
  })
})
