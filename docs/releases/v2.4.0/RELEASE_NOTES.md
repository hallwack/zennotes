ZenNotes 2.4.0 tightens the keyboard-first writing flow with refreshed in-app help, cleaner onboarding controls, and a fix for note tabs losing their place when you switch between them.

> Installers for macOS, Windows, and Linux are attached below once the build finishes. On Arch, `yay -S zennotes-bin`.

## ✨ Highlights

### Refreshed in-app help
The built-in Help tab now reflects the current app more completely: CSV databases, database-grid shortcuts, comments from the keyboard, always-on pane focus with **Alt+H/J/K/L**, palette navigation, and the expanded theme family list are documented in one place.

### Cleaner onboarding mode controls (#123)
The onboarding mode selector now uses a more consistent segmented-control layout, with clearer accessibility state for the active mode.

## 🐛 Fixes

- **Tabs keep their editor position (#127)** — switching between open note tabs now preserves each note's editor scroll position and cursor/selection. The editor no longer jumps back to line 1 when you scroll in one note, move somewhere else in another note, and return.

---

Thanks to everyone filing issues and reporting bugs — closes #127.
