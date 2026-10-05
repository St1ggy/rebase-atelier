# Terminal-native interface

## Visual direction

Compact is the default when no global preference is saved. It keeps one-line indexed action rows and fold gutters, removes summary/secondary sections, and opens an inspector only on demand. Full displays all sections and a persistent wide-terminal inspector. Minimal uses plain action/hash/subject rows, no icons or right pane, and a two-row footer. F2 and explicit palette commands switch the rendering policy without recreating the editing controller. Each policy reserves its own header/footer heights and recalculates viewport capacity on resize. The saved choice is global across repositories.

Mode changes clear inspector focus, preserve plan/cursor/selection/undo state, and queue preferences writes. Saves preserve unrelated config fields and are flushed before invoking a child editor. A preference write failure is surfaced but cannot prevent saving a native rebase plan. Minimal does not fetch patches for an invisible inspector.

Atelier is an Operate surface: the plan leads, the selected commit and its patch support decisions, and keyboard commands stay in a fixed-height footer at the bottom of the terminal.

- A full-window workbench with two-column horizontal insets: the header and bottom footer keep their height while the plan and inspector occupy all remaining width and height. Viewport capacity follows terminal resize and optional session notices; pane sizes stay stable while patches load.
- Quiet header, native VCS/mode labels, explicit kept/folded/dropped counts.
- Indexed commit rows, action icons and colors, muted IDs, a full-width native inverse cursor band and struck-through drop subjects (without striking the padding).
- Two-line rhythm on taller terminals; dense rows on small terminals. Fold groups share one fixed gutter, with vertical trunks continuing through spacer lines and interleaved drops.
- Contextual patch inspector with added/removed/hunk styling and keyboard focus.
- Compact dialogs and a scrolling searchable command palette.
- Commit-specific demo patches, including large authentication/test/middleware examples with several files, accurate file/hunk summaries and enough content to exercise inspector paging; examples are explicitly labeled as demo data.

## Color contract

`terminal` is the default. Foreground and background carry OpenTUI default color intent. Action colors use native ANSI slots (red/green/yellow/blue/cyan). Detection supplies RGB snapshots for derived surfaces, selection and secondary text; readable accent and secondary colors are checked against the actual background.

`observeTerminalTheme` performs bounded palette queries, listens for palette/theme/focus events, and refreshes supported same-mode palettes periodically. Listeners and timers are removed on shutdown; suspended/unsupported terminals fall back without blocking startup. Retained theme references expose reactive getters, so all screens update.

Explicit dark/light presets remain available. Monochrome presentation does not replace a detected terminal background with a fixed dark palette.

## Icons

The Nerd palette uses established Nerd Fonts private-use glyphs (Octicons and Font Awesome), with two-cell icon fields for alignment. No font detection is claimed: choose a Nerd Font, or use `--icons unicode` / `--icons ascii`. The icon names and fallbacks are centralized in `src/ui/icons.ts`.

## Rich text

OpenTUI Solid 0.5.14 coerces an object assigned to the generic `content` property into a string. `RichText` deliberately updates the public Core TextRenderable setter in a reactive effect so StyledText chunks retain color intents and attributes instead of rendering as `[object Object]`.

## Validation

Native styled-frame tests assert that the cursor band covers the full row width, that multi-selection backgrounds differ from the cursor state, and that rendered tree joints and spacer trunks occupy the same display column. The cursor no longer relies on an arrow glyph.

Native renderer tests cover theme updates, light/dark palette derivation, contrasts and intent preservation, Nerd/plain alignment, selected demo content, inspector scrolling, group movement and dialog behavior. Character-frame inspection covers a tall two-pane view and an 80×24 light/ASCII view. Mechanical layout scan reports no findings; actual terminal acceptance is provided by the PTY workflow smoke.
