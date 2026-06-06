// Surgical YAML frontmatter helpers for the share feature.
//
// gray-matter is deliberately avoided: it reserializes the whole YAML
// block (reordering keys, normalizing quotes), while these helpers only
// touch the two share keys and leave every other byte of the note as
// the user wrote it.

export const SHARE_ID_KEY = 'share_id'
export const SHARE_URL_KEY = 'share_url'

export interface ShareFrontmatter {
  shareId: string | null
  shareUrl: string | null
}

interface FrontmatterBlock {
  /** Byte offset where the block starts (after any BOM). */
  start: number
  /** Offset just past the closing delimiter line (including its EOL). */
  end: number
  /** Inner lines between the delimiters, without EOLs. */
  lines: string[]
  /** The dominant line ending inside the file. */
  eol: '\n' | '\r\n'
}

function dominantEol(body: string): '\n' | '\r\n' {
  return body.includes('\r\n') ? '\r\n' : '\n'
}

function bomOf(body: string): string {
  return body.startsWith('\uFEFF') ? '\uFEFF' : ''
}

/**
 * Locate the leading YAML frontmatter block. YAML frontmatter is only
 * valid at the very start of the file (after an optional BOM), which
 * matches how remark-frontmatter parses notes for rendering.
 */
function findFrontmatterBlock(body: string): FrontmatterBlock | null {
  const bom = bomOf(body)
  const text = body.slice(bom.length)
  const eol = dominantEol(text)

  if (!(text.startsWith('---\n') || text.startsWith('---\r\n'))) return null

  const firstLineEnd = text.indexOf('\n') + 1
  const lines: string[] = []
  let cursor = firstLineEnd

  while (cursor <= text.length) {
    const nextBreak = text.indexOf('\n', cursor)
    const rawLine = nextBreak === -1 ? text.slice(cursor) : text.slice(cursor, nextBreak)
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine

    if (line.trimEnd() === '---') {
      const end = nextBreak === -1 ? text.length : nextBreak + 1
      return { start: bom.length, end: bom.length + end, lines, eol }
    }

    if (nextBreak === -1) break
    lines.push(line)
    cursor = nextBreak + 1
  }

  return null
}

function matchShareKey(line: string): { key: string; value: string } | null {
  const match = /^(share_id|share_url)\s*:\s*(.*)$/.exec(line)
  if (!match) return null
  return { key: match[1]!, value: match[2]!.trim() }
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1)
    }
  }
  return value
}

/** Read the share keys from a note body's frontmatter, if present. */
export function readShareFrontmatter(body: string): ShareFrontmatter {
  const block = findFrontmatterBlock(body)
  const result: ShareFrontmatter = { shareId: null, shareUrl: null }
  if (!block) return result

  for (const line of block.lines) {
    const entry = matchShareKey(line)
    if (!entry) continue
    const value = unquote(entry.value)
    if (entry.key === SHARE_ID_KEY && result.shareId === null) {
      result.shareId = value || null
    } else if (entry.key === SHARE_URL_KEY && result.shareUrl === null) {
      result.shareUrl = value || null
    }
  }

  return result
}

function sanitizeValue(value: string): string {
  // Share values are single-line YAML scalars; never let an injected
  // newline rewrite the rest of the block.
  return value.replace(/[\r\n]+/g, ' ').trim()
}

/**
 * Insert or update the share keys in a note body, preserving every
 * other byte (other frontmatter keys, ordering, EOL style, BOM).
 */
export function upsertShareFrontmatter(
  body: string,
  share: { shareId: string; shareUrl: string }
): string {
  const shareId = sanitizeValue(share.shareId)
  const shareUrl = sanitizeValue(share.shareUrl)
  const block = findFrontmatterBlock(body)

  if (!block) {
    const bom = bomOf(body)
    const rest = body.slice(bom.length)
    const eol = dominantEol(rest || '\n')
    const blockText = `---${eol}${SHARE_ID_KEY}: ${shareId}${eol}${SHARE_URL_KEY}: ${shareUrl}${eol}---${eol}`
    return `${bom}${blockText}${rest}`
  }

  const lines = [...block.lines]
  let replacedId = false
  let replacedUrl = false

  for (let index = 0; index < lines.length; index += 1) {
    const entry = matchShareKey(lines[index]!)
    if (!entry) continue
    if (entry.key === SHARE_ID_KEY && !replacedId) {
      lines[index] = `${SHARE_ID_KEY}: ${shareId}`
      replacedId = true
    } else if (entry.key === SHARE_URL_KEY && !replacedUrl) {
      lines[index] = `${SHARE_URL_KEY}: ${shareUrl}`
      replacedUrl = true
    }
  }

  if (!replacedId) lines.push(`${SHARE_ID_KEY}: ${shareId}`)
  if (!replacedUrl) lines.push(`${SHARE_URL_KEY}: ${shareUrl}`)

  return replaceBlockLines(body, block, lines)
}

/** Remove the share keys; drops the whole block if that empties it. */
export function removeShareFrontmatter(body: string): string {
  const block = findFrontmatterBlock(body)
  if (!block) return body

  const lines = block.lines.filter((line) => matchShareKey(line) === null)
  if (lines.length === block.lines.length) return body

  if (lines.every((line) => line.trim() === '')) {
    return body.slice(0, block.start) + body.slice(block.end)
  }

  return replaceBlockLines(body, block, lines)
}

/** The note body with any leading frontmatter block removed. */
export function stripFrontmatter(body: string): string {
  const block = findFrontmatterBlock(body)
  if (!block) return body
  return body.slice(0, block.start) + body.slice(block.end)
}

function replaceBlockLines(body: string, block: FrontmatterBlock, lines: string[]): string {
  const { eol } = block
  const inner = lines.map((line) => `${line}${eol}`).join('')
  const blockText = `---${eol}${inner}---${eol}`
  const hadTrailingEol = body.slice(block.start, block.end).endsWith('\n')
  const text = hadTrailingEol ? blockText : blockText.slice(0, -eol.length)
  return body.slice(0, block.start) + text + body.slice(block.end)
}
