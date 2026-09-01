# Tool call rendering — fix plan

> **TEMPORARY — delete this file when all changes below are done.**

Reference: Claude Code mobile web tool rendering (screenshots reviewed 2026-08-31).

## Target UX (what Claude does)

- Tool calls render as muted one-line summaries between text blocks, never JSON.
- Summary lines are verb sentences: "Ran 3 commands, found files, searched code", "Edited `file.ts` +8 -3", "Created 3 files +17 -0".
- Diff counts appear only when files changed. A command-only group has no +x -y.
- Bash rows show the command _description_, not the raw command. The raw command lives in the detail view.
- Chevron opens a bottom sheet (drawer), never an inline expand. The sheet body is the only scrollable region. Drag handle, dimmed backdrop.
- The sheet is a navigation stack: group list → tap row → detail slides in from the right. Header button is ✕ at top level, ‹ after drill-in.
- Group list rows: tool icon + verb + muted argument, connected by a vertical timeline line.
- Detail view: bold centered tool name; at most 2 labeled fields, per tool:
  - Bash → Command / Output
  - Grep, Glob → Pattern / Output
  - Edit → File / Output (diff)
  - Write → File / Content (all-green diff)
  - Read → filename header only, numbered file body, no labels
- Empty input → omit the input section entirely.
- MCP tool names are humanized ("Get my user profile"). JSON output gets a Prettify toggle.
- Diffs: line numbers, red block then green block, colored left gutter bar. Code lines clip at the right edge (no wrap). Plain output wraps (no horizontal page scroll).
- No spinners, no status badges, no JSON. Monospace only inside bordered rounded boxes.

## Fix list

### Collapsed line (in chat)

- [x] 1. Replace JSON tool rendering with a muted one-line summary per tool group: verb sentence + chevron.
- [x] 2. Single file change: `Edited <basename> +8 -3` — basename unmuted mono, counts colored, path elided.
- [x] 3. Multi-tool group: aggregate sentence + summed diff counts only when > 0.

### Drawer

- [x] 4. On the phone the chevron opens a bottom sheet; sheet body is the only scrollable region; drag handle + dimmed backdrop. On desktop the row unfolds in place with a capped, internally scrolling body (see 13).
- [x] 5. Sheet header: bold tool name (or group summary), ✕ at top level, ‹ after drill-in; detail slides in from the right.

### Detail content

- [x] 6. Two fields max, semantic labels per tool; omit empty input; humanize via `_meta["x.ai/tool"].label`.
- [x] 7. Edit/Write render a real diff: line numbers (fallback start 1), red/green rows, gutter bar, clipped code lines; Write all-green.
- [x] 8. Read special layout: filename header + numbered file body.
- [x] 9. Prettify toggle for JSON output; plain output wraps, never horizontal page scroll.

## Added scope (user, mid-review)

- [x] 10. Plan above the composer collapses to one line on all devices; opening it is a drawer, not an inline expand.
- [x] 12. Turn-total `1 file +36 −16` line above the composer removed — the collapsed run lines already carry the counts (one fact, one representation).
- [x] 13. Desktop expansion stays (matches Claude), but capped: detail body is `max-h-96` and scrolls inside its border, so opening never jumps the page. Phone is always a drawer.
- [ ] 14. Host follow-up (not UX): `acp-update-mapper` logged `prompt_index_mismatch` (expected 6, actual 7) on conversation `01a05924…` — the aggregate's promptIndex prediction drifted, so that turn's ids flip on replay. Investigate after the UX work.
- [ ] 11. LAST review task: audit the conversation screen for remaining inline expands on phone. Still expanding in place: Reasoning ("Thought for…"), Sources. Everything else now opens a sheet.

## Spike findings (2026-08-31)

**Answer: web-only.** The host forwards the complete ACP `ToolView` untouched (`acp-update-mapper.ts` → `tool.updated` → projector). Every fix is presentation in `apps/web`.

### Data we already have per tool call

Verified against `apps/host/tests/fixtures/acp/*.json` (real Grok payloads):

- `title` — Grok's human title, e.g. `` Execute `head -n 1 README.md` ``, `` Read `README.md` ``.
- `rawInput` — structured. Execute: `{ variant: "Bash", command, description, is_background }` — the **command and the description both exist**. Read: `{ target_file, limit }`.
- `_meta["x.ai/tool"]` — `{ name, kind, label }`, e.g. label "Run Command", "Read". Use `label` to humanize.
- `content` — clean display output: `{type:"content", content:{type:"text", text}}` for execute (pretty stdout), `{type:"diff", path, oldText, newText, _meta:{old_line, new_line}}` for edits (replaced span, not whole file).
- `rawOutput` — noisy machine shape (exit_code, output byte array, output_file…). The pretty text is already in `content`; rawOutput is detail-view-only material.
- `locations` — file paths.

### What the web already does right (keep)

- `tool-runs.ts`: grouping into runs, `describeRun` verb sentences, per-edit `+N −M` via `spanDiffCounts`, `turnChanges`.
- `tool-run.tsx`: phone Drawer for settled runs, desktop Collapsible.
- `span-diff.ts`: span diff model with `old_line`/`new_line` from `_meta`.
- Status dot system in `tool.tsx` (live-progress affordance; Claude has an equivalent shimmer).

### Root causes of the JSON mess

1. `ToolInput` (`ai-elements/tool.tsx:145`) dumps `part.input` — which is the projector wrapper `{ value, title, kind, locations, _meta }` — as a JSON "Parameters" block. Never show this wrapper; extract per-kind fields from `input.value`.
2. `ConversationToolOutput` appends `rawOutput` as a JSON "Result" block even when `content` already carries the pretty text. Show `content`; put `rawOutput` behind the detail view (Prettify), or drop it when `content` exists.
3. Single calls and unsettled runs render inline expanded rows on the phone instead of a summary line + sheet.
4. The phone Drawer for a run dumps all rows (each with its own collapsible + JSON) — no list → detail navigation stack.

## Fix mapping (all in apps/web)

| Fix                   | Files                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1-3 collapsed lines   | `tool-run.tsx`, `tool-runs.ts` (single-call summary line: title or verb + basename + counts)                                           |
| 4-5 sheet + nav stack | `tool-run.tsx`, new sheet component; slide-in detail, ✕ vs ‹ header                                                                    |
| 6 semantic fields     | new per-kind detail view replacing `ToolInput`; labels Command/Pattern/File; omit empty input; humanize via `_meta["x.ai/tool"].label` |
| 7 diff rendering      | `span-diff.ts` + `code-block.tsx`: line numbers from `old_line`/`new_line`, red/green rows, gutter bar, clip long lines                |
| 8 Read layout         | per-kind detail view: filename header (from `locations[0].path`), numbered body from `content` text                                    |
| 9 Prettify + wrap     | detail view: JSON toggle for `rawOutput`; plain output wraps                                                                           |
