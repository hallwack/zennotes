import React from 'react'
import ReactDOM from 'react-dom/client'
import type { AssetMeta, ImportedAssetKind, NoteContent, VaultInfo } from '@shared/ipc'
import { readSharePagePayload, type SharePagePayload } from './payload'
import { installShareViewerBridge } from './shim'
// The full app stylesheet (prose, themes, KaTeX, highlight, diagram
// chrome) — the same file the PDF export window ships wholesale.
import '@renderer/styles/index.css'

const payload = readSharePagePayload()
if (payload) {
  // The bridge must exist before any app-core module runs.
  installShareViewerBridge(payload)
  void boot(payload)
} else {
  console.error('zen-share-data payload missing or malformed; leaving fallback markup in place.')
}

async function boot(data: SharePagePayload): Promise<void> {
  applyTheme()

  // Imported lazily so the shim is installed before app-core touches
  // window.zen, and so the store never boots on malformed pages.
  const [{ useStore }, { LazyPreview }] = await Promise.all([
    import('@renderer/store'),
    import('@renderer/components/LazyPreview')
  ])

  const notePath = 'shared-note.md'
  const note: NoteContent = {
    path: notePath,
    title: data.title,
    folder: 'inbox',
    siblingOrder: 0,
    createdAt: data.published_at ? Date.parse(data.published_at) : Date.now(),
    updatedAt: data.updated_at ? Date.parse(data.updated_at) : Date.now(),
    size: data.markdown.length,
    tags: [],
    wikilinks: [],
    hasAttachments: Object.keys(data.assets).length > 0,
    excerpt: '',
    body: data.markdown
  }

  // Asset refs double as vault-relative paths: the publisher uploaded
  // each asset under the literal markdown ref, so an identity mapping
  // makes app-core's resolver land on exactly those keys.
  const assetFiles: AssetMeta[] = Object.keys(data.assets).map((ref, index) => ({
    path: ref,
    name: ref.split('/').pop() ?? ref,
    kind: assetKindOf(ref),
    siblingOrder: index,
    size: 0,
    updatedAt: 0
  }))

  useStore.setState({
    vault: { root: '/shared', name: 'Shared note' } satisfies VaultInfo,
    notes: [],
    assetFiles,
    selectedPath: notePath,
    activeNote: note
  })

  const root = document.getElementById('zen-share-root')
  if (!root) return
  root.textContent = ''

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <main className="zen-share-note">
        <LazyPreview markdown={note.body} notePath={note.path} onRendered={neutralizeAppOnlyInteractions} />
      </main>
    </React.StrictMode>
  )
}

/** Fixed light theme, flipping to the dark twin with the OS preference. */
function applyTheme(): void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = (): void => {
    const html = document.documentElement
    html.dataset.theme = media.matches ? 'github-dark' : 'github-light'
    html.setAttribute('data-opaque', '')
    html.style.colorScheme = media.matches ? 'dark' : 'light'
  }
  apply()
  media.addEventListener('change', apply)

  const style = document.createElement('style')
  style.textContent = `
    /* The app stylesheet treats the document as a fixed-viewport app
       shell (height: 100%, overflow: hidden, user-select: none). A
       public page is a normal scrolling document — undo all three,
       same as the PDF export window does. */
    html, body {
      height: auto !important;
      min-height: 100vh;
      margin: 0;
      overflow: visible !important;
      user-select: text !important;
      background: rgb(var(--z-bg));
    }
    .zen-share-note { padding: 8px 0 48px; }
    .zen-share-note .prose-zen a.wikilink,
    .zen-share-note .prose-zen a.wikilink.broken,
    .zen-share-note .prose-zen a.hashtag {
      color: rgb(var(--z-grey-1));
      border-bottom: 1px dashed rgb(var(--z-grey-dim));
      text-decoration: none;
      pointer-events: none;
      cursor: default;
    }
    .zen-share-note .prose-zen input[type="checkbox"] {
      pointer-events: none;
    }
  `
  document.head.appendChild(style)
}

/**
 * Wikilinks, hashtags, and task checkboxes act on the vault in-app; on
 * a public page they are inert text. CSS removes the affordances; this
 * pass drops the zen:// hrefs and locks checkboxes for good measure.
 */
function neutralizeAppOnlyInteractions(): void {
  const root = document.getElementById('zen-share-root')
  if (!root) return
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a.wikilink, a.hashtag')) {
    anchor.removeAttribute('href')
  }
  for (const checkbox of root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    checkbox.disabled = true
  }
}

function assetKindOf(ref: string): ImportedAssetKind {
  const ext = ref.toLowerCase().split('.').pop() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'apng'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (['mp3', 'm4a', 'aac', 'flac', 'ogg', 'wav'].includes(ext)) return 'audio'
  if (['mp4', 'm4v', 'mov', 'ogv', 'webm'].includes(ext)) return 'video'
  return 'file'
}
