# VCS support and acceptance evidence

## Scope

All four adapters are implemented. Acceptance is deliberately distinguished from code availability.

| VCS | Native interface | Local evidence | Remaining acceptance |
| --- | --- | --- | --- |
| Git 2.54.0 | GIT_SEQUENCE_EDITOR, GIT_EDITOR, mergetool | Real temporary repositories: history, diff, fixup, conflicts, abort; full Git parent/child workflow in a real PTY | Broader rebase-merges/root/onto and structural-conflict fixtures |
| Arc r21304006.1 | ARC_SEQUENCE_EDITOR, ARC_EDITOR, index-side reads | CLI help, real bounded log JSON; plan codec and protocol contract tests | Live rebase, continuation and conflict-side extraction in an isolated Arc test checkout |
| Mercurial 7.2.4 | HGEDITOR, histedit/rebase extensions, merge tool | Real temporary repositories: history, histedit roll, rebase conflict, merge-tool invocation, continue and final tree | Broader structural-conflict and phase fixtures |
| Jujutsu 0.45.1 | Native operation plan, ui.editor, ui.merge-editor | Real temporary workspaces: stable identities, reorder, fixup, abandon, conflicted revisions outside @, message-step resume, ambiguous-call guard | Broader native graph and multi-way conflict fixtures |

## Platform evidence

- Local verification: 48 tests / 214 assertions pass, including default/ANSI color intents, light/monochrome contrasts, live palette observation/cleanup, reactive renderable updates, display modes, global preferences, icon alignment and selected demo content. The rebuilt macOS arm64 executable and the locally packed npm command pass full PTY acceptance.

- macOS arm64: Bun 1.4.2, Node 24.19.0; native renderer and keyboard tests run locally.
- macOS arm64: source-mode PTY runs plan/message editors, text/binary resolution and full Git workflow from foreign cwd; canonical/echo flags are restored.
- Four standalone artifacts cross-compile; the macOS arm64 executable passes real PTY acceptance for native-plan/message/text/binary editors and the parent/child Git workflow.
- Linux and Windows binaries are produced, but production-terminal acceptance on these OSes is not established by cross-compilation.
- CI is provided for macOS/Linux/Windows headless tests and native build smoke. A workflow file is not a claim that the remote jobs have run.
- Arc client availability and authenticated test infrastructure are separate from application portability.

## Arc probe notes

The installed client documents separate ARC_SEQUENCE_EDITOR and ARC_EDITOR, rebase --continue/--skip/--abort, --onto and --autosquash. Arc log JSON uses commit, author, date, message and parents; the adapter retains full IDs.

The attempted temporary --local setup creates native-filesystem Arcadia metadata rather than an empty standalone toy repository. Only read-only metadata was inspected; no commits or branch rewrites were performed there. Its temporary stores were removed. Live rewrite/conflict acceptance remains open.

## Limits

- Text merge is UTF-8 and limited to 2 MB per side. Binary/non-UTF-8/oversized input uses exact whole-file selection.
- The current file is not silently replaced by the diff3 algorithm. Regeneration is explicit.
- Multi-way JJ, Arc copy-info and structural conflicts require a backend-native resolution path when a two-sided text merge is insufficient.
- JJ linear planning is limited to mutable single-parent changes. The native graph rebase workflow preserves native topology semantics.
- History queries are bounded to 100 revisions. Inspector results are versioned so stale requests cannot replace current selection.
- Planning undo/redo is separate from undoing completed VCS operations. JJ journal resumption checks operation head and in-flight state.
- Mercurial automatically quotes substituted merge-tool paths. The adapter does not quote the substitutions twice; local is the applied change and other is the destination during rebase.
- JJ conflict resolution targets a change identity, so a fresh working-copy snapshot does not accidentally resolve an obsolete commit and create divergence.
