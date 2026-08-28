# Chat UI tweaks

Source: screenshots of Codex, Claude, and Grok phone apps, 2026-08-28. Each
item names what they do, what Porte does now, and the change.

Reference stories (Storybook on http://localhost:6006):

- Tool rows and a diff: `/?path=/story/design-system-ai-chat-states--tool-calls`
- Code block specimens: `/?path=/story/design-system-ai-elements--transcript` ("Code" section)
- Markdown with a fenced block: `/?path=/story/design-system-ai-chat-states--ready`

## 1. Tool calls

1. **One verb row per call.** Theirs: `✎ Edited client.ts +1 −0 ›`, `📖 Read client.ts ›`, `▸ Ran ls packages/… ›`. Ours: status dot + `read_file` in mono. Change: icon per ACP `kind`, label from `title`, `+N −M` from the diff, chevron right. Data is already in the part (`conversation-event-projector.ts:171-174`).
2. **Fold finished runs.** A run is every consecutive tool part between two text or reasoning parts. The run in flight stays open as rows; every finished run folds to one row: `Edited 4 files, deleted 1 file, explored 13 files, 1 search` (Codex) or `Ran 6 commands ›` (Claude). One-call runs are just the row. Counts group by `kind`, deduped by path; `Created` when `oldText === null`.
3. **Folded run opens a sheet on phone.** Claude: tapping `Ran 5 commands ›` opens a bottom sheet titled the same, with the rows as a timeline (icon, verb in foreground, description in muted, thin vertical line between rows, X to close). Desktop: expand inline.
4. **Tool card inside a step.** Grok: a step title with a check (`✓ Running a test shell command`), then a card `▸ Ran command` with copy on the right and the command in mono below, then a status card (`Connected to computer`), then `✓ Done`. Use for a run's expanded view: header row = title, body = input or diff.
5. **Status by glyph, not dot.** Check for done, spinner for running, red text for failed. Our dot stays as the running indicator only.

## 2. Reasoning

1. **Title, not timer.** Codex: `Refining UIMessage type usage ⌄`; Grok: `Thoughts ›`. Ours: `Thought for N seconds` with a brain icon. Change: first line of the reasoning text as the trigger, muted, no icon, caret right.
2. **Opens a sheet on phone.** Grok: `Thoughts ›` opens a bottom sheet titled `Thoughts` that holds the reasoning and the tool cards from that stretch. Desktop: inline collapsible as now.
3. **No auto-open.** Reasoning stays closed while it streams; the trigger shimmers instead. Ours opens every block while streaming and closes it one second later.

## 3. Code and diffs

1. **Header on every block.** Language or `Diff` left, copy right (Grok adds expand). `rounded-xl`, muted fill, `border`, no wrap, horizontal scroll. Ours: `CodeBlock` renders no header in the transcript; the header parts exist but only the specimen story uses them.
2. **Diff shows old and new.** Ours passes `newText` only with `language="diff"`. Change: build a unified diff from `oldText`/`newText` (or render two-colour lines), with `@@` hunk header, `+` green, `−` red.
3. **Full-screen viewer on tap.** Codex: `Done` left, filename centre, share right, line numbers, wrapped long lines. Use the `Sheet` full height on phone, a `Dialog` on desktop.
4. **Streamdown fences use the same block.** Add `@source "../../../../node_modules/streamdown/dist/*.js"` to `globals.css` so its classes exist, then pass our `CodeBlock` through Streamdown's `components` so a fenced block and a tool block look the same.
5. **Inline code and file chips.** Grok colours inline code with an accent and renders a file reference as a chip (doc icon + name on a pill). Ours: inline code on `bg-muted` at 95% size, no chips. Chip is a later item; accent colour on inline code is one token.

## 4. Sheets on phone

Done: the `+` menu is an "Add context" sheet below `md` (`composer-add-menu.tsx`): X left, title centred, Camera and Photos tiles, Add files row, commands. Reuse that shape for the rest.

1. **Mode and configuration pickers.** Claude: `Select mode` sheet with title, description, and a check on the current row. Ours: `Mode: code` as static text hidden below `md`. Change: a tappable pill that opens the same sheet shape; `configuration` options too.
2. **Folded tool runs and reasoning.** Items 1.3 and 2.2 use the same `Drawer`.

## 5. Transcript

1. **Body text at 16px.** Codex and Grok run ~17px. Ours: `MessageContent` sets `text-sm` (14px), below the typography floor for body copy. Change: drop `text-sm`, let `p` take the base.
2. **User bubble.** Grok: right-aligned, `w-fit`, `rounded-2xl`, dark-gray fill, no `dark` class. Ours: `rounded-lg bg-secondary` with a stray `is-user:dark`. Change: `rounded-2xl`, remove `is-user:dark`, keep `bg-secondary`.
3. **Answer is the page.** Same as now. Keep `max-w` off the assistant column; user bubble caps at ~85%.
4. **Message actions.** Grok: copy, share, up, down, speak, retry, more, plus duration right-aligned under each answer. `MessageActions` exists unused. Later: copy + retry only.
5. **Suggestion chips.** Grok: `Think harder` pill above the composer. Skip.

6. **Turn status line.** Claude: `★ Noodling…` in the accent colour under the last message while the answer is being written, before the first token. Ours: only the submit button changes to a spinner. Change: one `Shimmer` line below the transcript while `status === 'submitted'`.
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
