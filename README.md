# Rebase Atelier

A keyboard-driven history editor for Git, Arc, Mercurial, and Jujutsu.

## Install

```sh
npm install --global @st1ggy/rebase-editor
rebase-editor --demo
```

Requires Node.js 20+ and a native VCS client. Standalone binaries include the Bun runtime.

## Usage

```sh
rebase-editor --vcs git
rebase-editor --vcs hg --cwd /path/to/repository
GIT_SEQUENCE_EDITOR='rebase-editor --vcs git --sequence-editor' git rebase -i HEAD~5
```

Arrow keys navigate and move commits. Use `p/r/e/s/f/d` for actions, `z/Z` for undo/redo, `Ctrl+P` for commands, and `Ctrl+S` to apply.

Compact is the default display. F2 switches Full, Compact, and Minimal. Preferences are saved globally in `~/.config/rebase-atelier/config.json` or `$XDG_CONFIG_HOME/rebase-atelier/config.json`.

## Development

```sh
bun install --frozen-lockfile
bun run dev -- --demo
bun run check
```

See the [interface guide](docs/interface.md), [VCS support](docs/vcs-support.md), and [release guide](docs/releasing.md).

## Credits

Inspired by Sjur Bakka's original [rebase-editor](https://github.com/sjurba/rebase-editor).

[MIT License](LICENSE).
