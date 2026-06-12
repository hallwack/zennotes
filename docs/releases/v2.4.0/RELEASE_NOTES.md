ZenNotes 2.4.0 lets daily and weekly notes follow your own folder and filename patterns, and tightens the keyboard-first writing flow with refreshed in-app help, cleaner onboarding controls, and a fix for note tabs losing their place when you switch between them.

> Installers for macOS, Windows, and Linux are attached below once the build finishes. On Arch, `yay -S zennotes-bin`.

## ✨ Highlights

### Configurable daily & weekly note patterns (#77)
Daily and weekly notes can now follow your own folder and filename conventions. Set a **directory pattern** and a **naming pattern** from date tokens — `yyyy`, `MM`, `MMM`, `dd`, `EEE`, `ww`, and more — plus a **locale** for localized month and weekday names. For example, `yyyy/MM-MMM` with `yyyy-MM-dd-EEE` creates `2026/06-Jun/2026-06-09-Tue.md`, and you can wrap literal text in single quotes like `'Daily Notes'/yyyy/MM-MMM`. The previous behavior stays the default (`Daily Notes/2026-06-09.md`). Changing a pattern keeps your existing notes recognized — including titles that encode the day by ISO week and weekday — and a **Reset to defaults** button restores the directory, naming, and locale in one click.

### Refreshed in-app help
The built-in Help tab now reflects the current app more completely: CSV databases, database-grid shortcuts, comments from the keyboard, always-on pane focus with **Alt+H/J/K/L**, palette navigation, and the expanded theme family list are documented in one place.

### Cleaner onboarding mode controls (#123)
The onboarding mode selector now uses a more consistent segmented-control layout, with clearer accessibility state for the active mode.

## 🐛 Fixes

- **Tabs keep their editor position (#127)** — switching between open note tabs now preserves each note's editor scroll position and cursor/selection. The editor no longer jumps back to line 1 when you scroll in one note, move somewhere else in another note, and return.
- **Calendar recognizes existing daily notes (#131)** — daily and weekly note detection now uses the same vault-layout rules across the calendar, sidebar, and open/create commands, so synced or manually added date notes show their calendar dots and open without creating duplicates. Daily/weekly directory fields in Settings also wait until blur or Enter before saving, so they no longer snap back to the default while you are clearing or typing a path.
- **No more duplicated tooltips on sidebar icons (#141)** — the sidebar action icons (search, new note, new folder, sort, auto-reveal, collapse) showed their label twice on hover — the themed in-app tooltip plus the native OS tooltip. The redundant native tooltip is gone; the styled tooltip and screen-reader label remain.

---

Thanks to everyone filing issues and requests — closes #77, #127, #131, #141.
