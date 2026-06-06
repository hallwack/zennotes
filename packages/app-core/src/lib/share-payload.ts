import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkFrontmatter from 'remark-frontmatter'
import { visit } from 'unist-util-visit'
import type { SharePublishAsset } from '@shared/ipc'
import { remarkWikilinks } from './markdown'
import {
  canonicalAssetRef,
  classifyLocalAssetHref,
  resolveAssetVaultRelativePathIn,
  type LocalAssetKind
} from './local-assets'
import { stripFrontmatter } from './note-frontmatter'

export interface SharePayloadNote {
  /** Vault-relative POSIX path of the note. */
  path: string
  title: string
  /** Raw markdown body, frontmatter included. */
  body: string
}

export interface SharePayload {
  notePath: string
  title: string
  /** Frontmatter-stripped markdown — what the public page renders. */
  markdown: string
  /** Raw ```tikz fence bodies, deduped, in document order. */
  tikzSources: string[]
  /** Local assets the note references, resolved against the vault. */
  assets: SharePublishAsset[]
}

/** Link-node asset kinds that render as embeds and therefore upload. */
const EMBEDDABLE_LINK_KINDS = new Set<LocalAssetKind>(['pdf', 'audio', 'video'])

/**
 * Collect everything a share upload needs from a note: the public
 * markdown, the TikZ sources main pre-renders to SVG, and the local
 * asset refs with their resolved vault paths.
 *
 * Parsing reuses the production wikilink plugin so `![[embeds]]`
 * surface exactly as the preview renders them.
 */
export function buildSharePayload(
  note: SharePayloadNote,
  assetFiles: ReadonlyArray<{ path: string }>
): SharePayload {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml', 'toml'])
    .use(remarkWikilinks)
  const tree = processor.runSync(processor.parse(note.body))

  const tikzSources: string[] = []
  const seenTikz = new Set<string>()
  const assets: SharePublishAsset[] = []
  const seenRefs = new Set<string>()

  const addAsset = (url: string | null | undefined, allowed: ReadonlySet<LocalAssetKind>): void => {
    if (!url) return
    const kind = classifyLocalAssetHref(url)
    if (!kind || !allowed.has(kind)) return

    const ref = canonicalAssetRef(url)
    if (!ref || seenRefs.has(ref)) return
    // The server rejects SVG uploads (script-bearing when served raw);
    // TikZ SVGs travel separately inside the JSON payload.
    if (ref.toLowerCase().endsWith('.svg')) return

    const vaultRelPath = resolveAssetVaultRelativePathIn(assetFiles, note.path, url)
    if (!vaultRelPath) return

    seenRefs.add(ref)
    assets.push({ ref, vaultRelPath })
  }

  visit(tree, (node) => {
    if (node.type === 'code') {
      const code = node as { lang?: string | null; value?: string }
      if ((code.lang ?? '').trim().toLowerCase() === 'tikz') {
        const source = String(code.value ?? '')
        if (source && !seenTikz.has(source)) {
          seenTikz.add(source)
          tikzSources.push(source)
        }
      }
      return
    }
    if (node.type === 'image') {
      addAsset((node as { url?: string }).url, new Set<LocalAssetKind>(['image']))
      return
    }
    if (node.type === 'link') {
      addAsset((node as { url?: string }).url, EMBEDDABLE_LINK_KINDS)
    }
  })

  return {
    notePath: note.path,
    title: note.title,
    markdown: stripFrontmatter(note.body),
    tikzSources,
    assets
  }
}
