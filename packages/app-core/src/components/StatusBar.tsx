import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import type { NoteContent, NoteMeta, ShareRecord } from '@shared/ipc'
import { backlinksForNote } from '../lib/wikilinks'
import { countWords } from '../lib/word-count'
import { readShareFrontmatter } from '../lib/note-frontmatter'

/**
 * Footer strip showing quick stats for the active note: backlinks,
 * word count, character count, and estimated read time. Modelled on
 * the Obsidian status bar.
 *
 * Backlinks use the `wikilinks` field populated by the main process
 * on every `readMeta` call, so we don't need to re-scan note bodies
 * at render time.
 */
export function StatusBar({ note }: { note: NoteContent }): JSX.Element {
  const notes = useStore((s) => s.notes)

  const { words, characters, minutes } = useMemo(() => {
    const body = note.body
    const w = countWords(body)
    const c = body.length
    const m = Math.max(1, Math.round(w / 200))
    return { words: w, characters: c, minutes: m }
  }, [note.body])

  const backlinks = useMemo(() => {
    return backlinksForNote(notes as NoteMeta[], note).length
  }, [note, notes])

  const share = useMemo(() => readShareFrontmatter(note.body), [note.body])

  return (
    <div
      className="flex h-8 shrink-0 items-center justify-end gap-5 px-6 text-[11px] text-ink-500"
      style={{ borderTop: '1px solid var(--glass-stroke)' }}
    >
      {share.shareId !== null && <SharedChip note={note} shareId={share.shareId} shareUrl={share.shareUrl} />}
      <Stat>
        {backlinks} {backlinks === 1 ? 'backlink' : 'backlinks'}
      </Stat>
      <Stat>
        {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
      </Stat>
      <Stat>{characters.toLocaleString()} characters</Stat>
      <Stat>{minutes} min read</Stat>
    </div>
  )
}

/**
 * Status-bar chip for shared notes. Clicking it opens a popover with
 * the public link, live server stats (views, last publish), and the
 * share actions — the mouse-friendly twin of :share / :sharelink /
 * :unshare.
 */
function SharedChip({
  note,
  shareId,
  shareUrl
}: {
  note: NoteContent
  shareId: string
  shareUrl: string | null
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const chipRef = useRef<HTMLButtonElement | null>(null)

  return (
    <>
      <button
        ref={chipRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="This note is shared — click for details"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-accent transition-colors hover:bg-accent/20"
      >
        Shared
      </button>
      {open && (
        <SharePopover
          anchor={chipRef.current}
          note={note}
          shareId={shareId}
          shareUrl={shareUrl}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function SharePopover({
  anchor,
  note,
  shareId,
  shareUrl,
  onClose
}: {
  anchor: HTMLButtonElement | null
  note: NoteContent
  shareId: string
  shareUrl: string | null
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)
  const [record, setRecord] = useState<ShareRecord | null>(null)
  const [serverState, setServerState] = useState<'loading' | 'loaded' | 'missing' | 'error'>(
    'loading'
  )
  const [copied, setCopied] = useState(false)

  // Anchor above the chip (the status bar sits at the bottom edge).
  const position = useMemo(() => {
    const rect = anchor?.getBoundingClientRect()
    if (!rect) return { right: 16, bottom: 40 }
    return {
      right: Math.max(8, window.innerWidth - rect.right),
      bottom: Math.max(8, window.innerHeight - rect.top + 8)
    }
  }, [anchor])

  // Pull live stats for this share from the server, tolerating offline.
  useEffect(() => {
    let cancelled = false
    const numericId = Number(shareId)
    void window.zen
      .shareList()
      .then((records) => {
        if (cancelled) return
        const match = records.find((entry) => entry.id === numericId) ?? null
        setRecord(match)
        setServerState(match ? 'loaded' : 'missing')
      })
      .catch(() => {
        if (!cancelled) setServerState('error')
      })
    return () => {
      cancelled = true
    }
  }, [shareId])

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node) && e.target !== anchor) {
        onClose()
      }
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onClose)
    }
  }, [anchor, onClose])

  const url = record?.url ?? shareUrl

  const copyLink = (): void => {
    if (!url) return
    window.zen.clipboardWriteText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  const runAndClose = (action: (path?: string) => Promise<void>): void => {
    onClose()
    void action(note.path)
  }

  const state = useStore.getState()

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Shared note details"
      className="fixed z-[60] w-[300px] overflow-hidden rounded-xl bg-paper-100 p-1 shadow-float ring-1 ring-paper-300"
      style={{ right: position.right, bottom: position.bottom }}
    >
      <div className="px-2.5 pb-2 pt-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">
            Shared note
          </span>
          <span className="text-[11px] tabular-nums text-ink-500">
            {serverState === 'loading' && '…'}
            {serverState === 'loaded' &&
              `${(record?.viewCount ?? 0).toLocaleString()} ${record?.viewCount === 1 ? 'view' : 'views'}`}
          </span>
        </div>
        {url && (
          <button
            type="button"
            onClick={copyLink}
            title="Copy link"
            className="mt-1.5 block w-full truncate rounded-md bg-paper-200/70 px-2 py-1.5 text-left font-mono text-[11px] text-ink-800 transition-colors hover:bg-paper-200"
          >
            {copied ? 'Copied to clipboard' : url.replace(/^https?:\/\//, '')}
          </button>
        )}
        <div className="mt-1.5 text-[11px] leading-4 text-ink-500">
          {serverState === 'loaded' && record?.updatedAt && (
            <>Last published {relativeTime(record.updatedAt)}</>
          )}
          {serverState === 'missing' && (
            <span className="text-amber-500">
              Not on the server anymore — Update Share republishes it.
            </span>
          )}
          {serverState === 'error' && 'Could not reach the share server for stats.'}
        </div>
      </div>

      <div className="my-0.5 h-px bg-paper-300/60" />

      <PopoverAction label={copied ? 'Copied!' : 'Copy Link'} onSelect={copyLink} />
      <PopoverAction
        label="Open in Browser"
        onSelect={() => runAndClose(state.openShareInBrowser)}
      />
      <PopoverAction label="Update Share" onSelect={() => runAndClose(state.shareActiveNote)} />
      <div className="my-0.5 h-px bg-paper-300/60" />
      <PopoverAction
        label="Stop Sharing"
        danger
        onSelect={() => runAndClose(state.unshareActiveNote)}
      />
    </div>,
    document.body
  )
}

function PopoverAction({
  label,
  danger,
  onSelect
}: {
  label: string
  danger?: boolean
  onSelect: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
        danger
          ? 'text-[rgb(var(--z-red))] hover:bg-red-500/10'
          : 'text-ink-800 hover:bg-paper-200/70'
      ].join(' ')}
    >
      {label}
    </button>
  )
}

/** Compact "3m ago" / "2h ago" formatter for the popover stats line. */
function relativeTime(iso: string): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function Stat({ children }: { children: React.ReactNode }): JSX.Element {
  return <span className="tabular-nums">{children}</span>
}
