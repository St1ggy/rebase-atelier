# Rebase Atelier

A terminal history editor for **Git, Arc, Mercurial, and Jujutsu**.

Reorder, squash, fixup, edit, or drop commits. Inspect diffs, undo changes, and resolve conflicts with a three-way editor.

## Install

```sh
npm install --global rebase-atelier
rebase-atelier --demo
```

Requires Node.js 20+ and a native VCS client. Available for macOS ARM64/x64, Linux x64 (glibc), and Windows x64. [Standalone binaries](https://github.com/St1ggy/rebase-atelier/releases) include the Bun runtime.

## Usage

```sh
rebase-atelier                              # Detect the current workspace
rebase-atelier --vcs jj --cwd /path/to/repo  # Select a VCS and workspace
```

Use as a Git interactive rebase editor:

```sh
GIT_SEQUENCE_EDITOR='rebase-atelier --vcs git --sequence-editor' git rebase -i HEAD~5
```

## Keyboard

| Key                   | Action                                       |
| --------------------- | -------------------------------------------- |
| ↑ / ↓                 | Navigate                                     |
| Space / g             | Select commits / a fold group                |
| ← / →                 | Move selected commits                        |
| p / r / e / s / f / d | Pick / reword / edit / squash / fixup / drop |
| z / Z                 | Undo / redo                                  |
| Tab                   | Focus the inspector                          |
| Ctrl+P                | Command palette                              |
| Ctrl+S                | Apply or save                                |
| ?                     | Help                                         |
| Ctrl+C                | Cancel                                       |

## Display

- **Compact** (default): single-line commits and an on-demand inspector.
- **Full**: summary, groups, and a persistent inspector on wide terminals.
- **Minimal**: action, hash, and subject only.

Switch with **F2** or `--view full|compact|minimal`. The choice is saved globally in `$XDG_CONFIG_HOME/rebase-atelier/config.json`, defaulting to `~/.config/rebase-atelier/config.json`.

Colors follow the terminal palette. Nerd icons are enabled by default; choose a Nerd Font or use `--icons unicode` / `--icons ascii`.

## Development

Requires Bun 1.4+, Node.js 24.16+, Mercurial, and Jujutsu.

```sh
bun install --frozen-lockfile
bun run dev -- --demo
bun run check
```

[Interface](docs/interface.md) · [VCS support and limitations](docs/vcs-support.md) · [Releases](docs/releasing.md)

## Credits

Inspired by Sjur Bakka's original [rebase-editor](https://github.com/sjurba/rebase-editor).

[MIT License](LICENSE).
