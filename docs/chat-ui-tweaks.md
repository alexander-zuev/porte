# Chat UI tweaks

Source: screenshots of Codex, Claude, and Grok phone apps, 2026-08-28. Each
item names what they do, what Porte does now, and the change.

Reference stories (Storybook on http://localhost:6006):

- Tool rows and a diff: `/?path=/story/design-system-ai-chat-states--tool-calls`
- Code block specimens: `/?path=/story/design-system-ai-elements--transcript` ("Code" section)
- Markdown with a fenced block: `/?path=/story/design-system-ai-chat-states--ready`

## 1. Tool calls

1. **One verb row per call.** Done: icon by `kind` (read, edit, delete, search, execute, fetch; wrench for the rest), Grok's title from the part (`Edit \`relay.ts\``), `+N −M` for an edit, dot only while the call moves (`tool-run.tsx`, `tool.tsx`).
2. **Fold finished runs.** Done: `groupParts` cuts a message into parts and runs; a settled run of two or more folds to `Edited 1 file, read 2 files, ran 1 command` (`tool-runs.ts`). A run with a call still moving stays open.
3. **Folded run opens a sheet on phone.** Done: `Drawer` below `md`, inline `Collapsible` from `md` up.
4. **Tool card inside a step.** Grok: a step title with a check (`✓ Running a test shell command`), then a card `▸ Ran command` with copy on the right and the command in mono below, then a status card (`Connected to computer`), then `✓ Done`. Use for a run's expanded view: header row = title, body = input or diff.
5. **Status by glyph, not dot.** Check for done, spinner for running, red text for failed. Our dot stays as the running indicator only.

## 2. Reasoning

1. **Opens a sheet on phone.** Grok: `Thoughts ›` opens a bottom sheet titled `Thoughts` that holds the reasoning and the tool cards from that stretch. Desktop: inline collapsible as now.
2. **No auto-open.** Reasoning stays closed while it streams; the trigger shimmers instead. Ours opens every block while streaming and closes it one second later.

## 3. Code and diffs

1. **Header on every block.** Done: `TitledCodeBlock` (name + copy) on tool parameters, results, raw output, and diffs; theme `github-dark-default` everywhere; one shiki, through `@streamdown/code`.
2. **Diff shows old and new.** Done. Grok sends `diff` content on every edit as a *span* pair — `oldText`/`newText` are the replaced text, not the file; `_meta.old_line`/`new_line` give the position; a created file has `oldText: ''` (not `null`). `span-diff.ts` writes `−`/`+` lines with the `@@` header.
3. **Full-screen viewer on tap.** Codex: `Done` left, filename centre, share right, line numbers, wrapped long lines. Use the `Sheet` full height on phone, a `Dialog` on desktop.
4. **Streamdown fences use the same block.** Done: `@source` lines, highlighting through the shared plugin. Open, minor: a fenced block keeps Streamdown's frame (line numbers, download) while a tool block has ours; unify only if it bothers.
5. **Inline code and file chips.** Grok colours inline code with an accent and renders a file reference as a chip (doc icon + name on a pill). Ours: inline code on `bg-muted` at 95% size, no chips. Chip is a later item; accent colour on inline code is one token.

## 4. Sheets on phone

Done: the `+` menu is an "Add context" sheet below `md` (`composer-add-menu.tsx`): X left, title centred, Camera and Photos tiles, Add files row, commands. Reuse that shape for the rest.

1. **Mode and configuration pickers.** Claude: `Select mode` sheet with title, description, and a check on the current row. Ours: `Mode: code` as static text hidden below `md`. Change: a tappable pill that opens the same sheet shape; `configuration` options too.
2. **Folded tool runs and reasoning.** Items 1.3 and 2.2 use the same `Drawer`.

## 5. Transcript

1. **Type sizes.** Done: `pre code` pinned to 14px/20px, `text-xs` line height to 20px, composer textarea 16px on desktop. Open: `--text-3xl` and `--text-4xl` still use Tailwind's line-height ratio (38.4px, 44.4px); pin every `--text-*--line-height` to a `--leading-*` token in one block.
2. **User bubble.** Done: `rounded-2xl`, stray `is-user:dark` removed, `bg-secondary` kept.
3. **Answer is the page.** Same as now. Keep `max-w` off the assistant column; user bubble caps at ~85%.
4. **Message actions.** Grok: copy, share, up, down, speak, retry, more, plus duration right-aligned under each answer. `MessageActions` exists unused. Later: copy + retry only.
5. **Suggestion chips.** Grok: `Think harder` pill above the composer. Skip.

6. **Turn status line.** Done: while `status === 'submitted'` the transcript ends with an assistant message holding a shimmering "Thinking…"; the answer mounts in that slot, so nothing moves.
7. **Images in a user message.** Claude: a horizontal row of thumbnails inside the bubble, above the text. Ours: one `Attachments` block per file part, stacked. Change: collect the message's file parts into one row, then the text.

## 6. Composer and header

1. **Composer shape.** Grok: `rounded-3xl`, placeholder `Ask Anything`, row below with `+` circle, mode pill, mic, send. Codex: floating pill `Follow up`. Ours: `InputGroup` with `rounded-md`. Change: `rounded-2xl`, taller row, `+` as a circle button.
2. **Header shows the conversation.** Codex: title, `porte · Mac name` subtitle, back left, actions right, blurred backdrop. Ours: `Remote / Mac name`. Change: title from `ConversationSummary`, Mac name and status as subtitle, `backdrop-blur` with `bg-background/80`.
3. **Sticky change summary.** Codex: `101 files +6.9K −4.1K` chip above the composer while a turn edits. Later.
4. **Queued prompts.** Codex `Queued ···` above the composer; Claude changes the placeholder to `Queue for after this turn…` while streaming. Depends on host support. Later.

## 7. Conversations list (outside chat, noted for later)

1. **Card rows.** Claude: icon left, title, date right, `repo` subtitle with a cloud or laptop glyph, `Connected` in green on the live one. Unread: blue dot on the icon.
2. **New conversation as a floating pill** at the bottom right, above the list.
3. **Filter** (`All ⌄`) on the section header.

## Order

1. Tool rows and folding (1.1–1.3, 2.1), turn status line (5.6).
2. Code and diffs (3.1–3.4).
3. Transcript type, bubble, image row (5.1, 5.2, 5.7); then composer and header (6.1, 6.2).
4. Mode picker sheet (4.1).
