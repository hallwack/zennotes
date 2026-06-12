import { describe, expect, it } from 'vitest'
import type { NoteMeta, VaultSettings } from '@shared/ipc'
import { classifyDateNote } from './vault-layout'

function note(path: string, title: string): NoteMeta {
  return {
    path,
    title,
    folder: 'inbox',
    siblingOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    size: 0,
    tags: [],
    wikilinks: [],
    hasAttachments: false,
    excerpt: ''
  }
}

function settings(dailyDirectory: string, weeklyDirectory: string): VaultSettings {
  return {
    primaryNotesLocation: 'inbox',
    dailyNotes: { enabled: true, directory: dailyDirectory },
    weeklyNotes: { enabled: true, directory: weeklyDirectory },
    folderIcons: {}
  }
}

describe('classifyDateNote', () => {
  it('recognizes daily notes when the configured directory includes the primary inbox prefix', () => {
    const info = classifyDateNote(
      note('inbox/Journal/2026-06-12.md', '2026-06-12'),
      settings('inbox/Journal', 'Weekly Notes')
    )

    expect(info).toMatchObject({ kind: 'daily' })
    expect(info?.date).toEqual(new Date(2026, 5, 12))
  })

  it('recognizes weekly notes when the configured directory includes the primary inbox prefix', () => {
    const info = classifyDateNote(
      note('inbox/Weeks/2026-W24.md', '2026-W24'),
      settings('Daily Notes', 'inbox/Weeks')
    )

    expect(info).toMatchObject({ kind: 'weekly' })
    expect(info?.date).toEqual(new Date(2026, 5, 8))
  })
})
