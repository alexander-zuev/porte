# Chat UI tweaks

Source: screenshots of Codex, Claude, and Grok phone apps, 2026-08-28. Each
item names what they do, what Porte does now, and the change. Done items are
removed; the git log has them.

Reference stories (Storybook on http://localhost:6006):

- Tool rows, folded run, diff: `/?path=/story/design-system-ai-chat-states--tool-calls`
- Highlighted fence, attachment, sources: `/?path=/story/design-system-ai-chat-states--files-and-sources`
- Composer with files, phone sheet: `/?path=/story/design-system-ai-composer--phone`

## Facts learnt

- Grok sends `diff` content on every edit as a _span_ pair: `oldText`/`newText` are the replaced text, not the file; `_meta.old_line`/`new_line` give the position; a created file has `oldText: ''`, not `null`.
- Grok's first `tool_call` carries the raw tool name and no `kind`; the human title and `kind` arrive on the next update. The part already holds them (`title`, `toolMetadata`).
- Streamdown 2 highlights only through `@streamdown/code`; the plugin owns the one shiki copy, and `CodeBlock` reads from it.
- Base UI menu items fire `onClick`; Radix-style `onSelect` typechecks (it is React's text-selection event) and never runs.

## Remaining

### Transcript

1. **Reasoning sheet with tool steps.** Grok's sheet nests that stretch's tool rows under thought steps. Ours (done) shows the text only; the grouping is per message, so this is its own item.
2. **Images in a user message.** Claude: one row of thumbnails inside the bubble, above the text. Ours: one `Attachments` block per file part, stacked.
3. **Message actions.** Copy and retry under an answer; `MessageActions` exists unused. Later.

### Code

5. **Full-screen viewer on tap.** Codex: `Done` left, filename centre, share right, line numbers, wrapped lines. `Sheet` full height on phone, `Dialog` on desktop.
6. **Inline code accent, file chips.** Grok colours inline code with an accent and shows a file reference as a chip. Accent is one token; chips later.
7. **One frame for fenced and tool blocks.** A fenced block keeps Streamdown's frame (line numbers, download) while a tool block has ours. Unify only if it bothers.

### Sheets on phone

8. **Mode and configuration pickers.** Claude: `Select mode` sheet with title, description, and a check on the current row. Ours: `Mode: code` as static text hidden below `md`. A tappable pill that opens the same sheet as the `+` menu.

### Composer and header

9. **Composer shape.** `rounded-2xl`, taller row, `+` as a circle button. Ours: `InputGroup` with `rounded-md`.
10. **Header shows the conversation.** Title, `porte · Mac name` subtitle, blurred backdrop. Ours: `Remote / Mac name`.
11. **Sticky change summary.** Codex: `101 files +6.9K −4.1K` above the composer while a turn edits. Later.
12. **Queued prompts.** Codex `Queued ···`; Claude changes the placeholder to `Queue for after this turn…` while streaming. Needs host support. Later.

### Housekeeping

13. **Type scale line heights.** `--text-3xl`/`--text-4xl` still use Tailwind's ratio (38.4px, 44.4px). Pin every `--text-*--line-height` to a `--leading-*` token in one block.
14. **Catalog.** `shiki: ^4.4.3` in `pnpm-workspace.yaml` is unused since the plugin owns shiki.
15. **Design tests.** `test:design` needs a rerun and new baselines once the `packages/core` rename lands; page stories currently fail on "Failed to fetch" from that work, not from these changes.

### Conversations list (outside chat)

16. Card rows with icon, title, date, repo subtitle, unread dot; floating "New" pill; `All ⌄` filter.

## Order

1. Image row in a user message (2).
2. Composer shape + header (9, 10).
3. Full-screen viewer (5), mode picker (8).
4. Housekeeping (13–15) when the core rename lands.
