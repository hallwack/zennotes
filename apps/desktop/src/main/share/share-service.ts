import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { SharePublishRequest, ShareRecord } from '@shared/ipc'
import { renderTikz, tikzHash } from '../tikz'
import type { ShareAccountDeps } from './share-account'
import { requireShareClient } from './share-account'
import { ShareRequestError, type ShareUploadAsset, type ShareUploadBody } from './share-client'

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.ogv': 'video/ogg',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf'
}

export interface SharePublishContext extends ShareAccountDeps {
  /** Read an asset's bytes by vault-relative path (local fs or remote). */
  readAssetBytes(vaultRelPath: string): Promise<Uint8Array>
}

/**
 * Read asset bytes from a local vault, refusing paths that escape the
 * vault root (defense in depth — refs were resolved renderer-side).
 */
export async function readLocalVaultAsset(
  vaultRoot: string,
  vaultRelPath: string
): Promise<Uint8Array> {
  const absolute = path.resolve(vaultRoot, vaultRelPath)
  const rootPrefix = path.resolve(vaultRoot) + path.sep
  if (!absolute.startsWith(rootPrefix)) {
    throw new Error(`Asset path escapes the vault: ${vaultRelPath}`)
  }
  return fs.readFile(absolute)
}

/**
 * Publish (or re-publish) a note. Pre-renders the TikZ sources with the
 * shared WASM renderer, reads asset bytes, uploads everything in one
 * multipart request, and falls back to a fresh create when the share
 * was deleted server-side (PUT → 404).
 */
export async function publishShare(
  context: SharePublishContext,
  request: SharePublishRequest
): Promise<ShareRecord> {
  const client = await requireShareClient(context)

  const tikzSvgs: { hash: string; svg: string }[] = []
  for (const source of request.tikzSources) {
    const rendered = await renderTikz(source)
    if (rendered.ok && rendered.svg) {
      tikzSvgs.push({ hash: tikzHash(source), svg: rendered.svg })
    }
    // Failed renders are dropped — the viewer shows the raw source.
  }

  const assets: ShareUploadAsset[] = []
  for (const asset of request.assets) {
    try {
      const bytes = await context.readAssetBytes(asset.vaultRelPath)
      const extension = path.posix.extname(asset.vaultRelPath).toLowerCase()
      assets.push({ ref: asset.ref, bytes, mimeType: MIME_BY_EXTENSION[extension] ?? null })
    } catch {
      // A missing file shouldn't sink the publish; the viewer simply
      // renders that ref as a broken embed, same as the app would.
    }
  }

  const body: ShareUploadBody = {
    notePath: request.notePath,
    title: request.title,
    markdown: request.markdown,
    tikzSvgs,
    assets
  }

  if (request.existingShareId != null) {
    try {
      return await client.updateShare(request.existingShareId, body)
    } catch (error) {
      // The share was revoked from the website — publish a fresh one.
      if (!(error instanceof ShareRequestError && error.status === 404)) throw error
    }
  }

  return client.createShare(body)
}
