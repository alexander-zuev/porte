# Queued messages

Send while a turn runs. The message waits in a visible queue, runs when the turn ends, and can be reordered, sent now, or removed. Same UX on phone and desktop.

Stories: `Design System/AI/Composer Queue` (`apps/web/.storybook/design-system/composer-queue.stories.tsx`).

## 1. Flows

| #   | Flow                 | What happens                                                                                                    |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------- |
| F1  | First send           | Idle composer. Enter sends. Composer is disabled until `turn.started`. Unchanged.                               |
| F2  | Queue one            | Turn runs. Placeholder `Queue for after this turn…`. Enter queues. Composer clears. Pill shows `1`.             |
| F3  | Queue many           | Repeat F2. Order = send order. Pill counts.                                                                     |
| F4  | Auto-run             | Turn ends. Every queued message folds into one user message (parts joined by a blank line) and one turn starts. |
| F5  | Send now             | In the queue sheet, `↑` on a row. Running turn is cancelled; that row alone starts. Rapid presses: last wins.   |
| F6  | Reorder              | Drag the handle in the sheet. Keyboard: space, arrows, space.                                                   |
| F7  | Remove               | `×` on a row. Gone. No confirm: it never reached the machine.                                                   |
| F8  | Read                 | Tap the words. The whole message slides in from the right; back returns to the list.                            |
| F9  | Stop with a queue    | Stop cancels the running turn. The queue drains as in F4, same as Grok.                                         |
| F10 | Turn fails           | Same as F9.                                                                                                     |
| F11 | Reload, other device | Queue is shown everywhere. It lives in the relay, not the browser.                                              |
| F12 | Machine offline      | Queue stays. Drains when the machine is back and idle.                                                          |
| F13 | Edit                 | Later slice.                                                                                                    |

Not supported: steering. Enter on an empty composer does nothing. ACP has no inject method and Grok exposes none over stdio.

Not like Claude: queued messages are not slipped into the running turn, and they are not drawn inside the transcript until they start.

## 2. Storyboard

Phone width. Desktop is the same layout, wider.

```text
S1  Idle                          S2  Running, typing               S3  Queued 2
┌───────────────────────┐         ┌───────────────────────┐         ┌───────────────────────┐
│ ▸ user: Add tests     │         │ ▸ user: Add tests     │         │ ▸ user: Add tests     │
│ ◂ Reading parser.ts   │         │ ◂ Reading parser.ts   │         │ ◂ Reading parser.ts   │
│ ◂ Done. 3 tests added │         │ ✻ Thinking…           │         │ ✻ Thinking…           │
│                       │         │                       │         │              ┌──────┐ │
│                       │         │                       │         │              │ ◷ 2  │ │  ← pill
│ ┌───────────────────┐ │         │ ┌───────────────────┐ │         │ ┌───────────────────┐ │
│ │ Message Grok…     │ │         │ │ Then update the c▏│ │         │ │ Queue for after…  │ │
│ │ [+] [model▾]  [🎤][↑]│         │ │ [+] [model▾]  [🎤][↑]│         │ │ [+] [model▾]  [🎤][■]│
│ └───────────────────┘ │         │ └───────────────────┘ │         │ └───────────────────┘ │
└───────────────────────┘         └───────────────────────┘         └───────────────────────┘
                                   one button: ↑ with text,          tap pill → S4
                                   ■ Stop when empty

S4  Queue sheet                   S5  Message page                  S6  After Send now on #1
┌───────────────────────┐         ┌───────────────────────┐         ┌───────────────────────┐
│ [×]      Queue        │         │ [‹]        #1         │         │ ▸ user: Add tests     │
│                       │         │                       │         │ ◂ Reading… (stopped)  │
│ ≡ #1 Then update t… ↑ ×│         │ Then update the       │         │ ▸ user: Then update…  │
│ ≡ #2 Bump the ver…  ↑ ×│         │ changelog with what   │         │ ✻ Thinking…           │
│                       │         │ the tests cover. Keep │         │              ┌──────┐ │
│                       │         │ the entries short…    │         │              │ ◷ 1  │ │
│                       │         │                       │         │ ┌───────────────────┐ │
│                       │         │                       │         │ │ Queue for after…  │ │
└───────────────────────┘         └───────────────────────┘         └───────────────────────┘
 ≡ drag · words open S5            back → S4
```

Rules the frames encode:

1. One composer button, as Grok draws it: Stop when the composer is empty, the send arrow once there is text. While a turn runs the arrow queues.
2. The pill sits above the composer, right-aligned, only when the queue is not empty. Icon muted, count not.
3. The sheet is the one place for queue actions on every device. Row: drag handle, position, words (tap opens the message page), `↑` send now, `×` remove. No chevron: the words are the target.
4. The message page uses the same slide and header as the tool sheet (`SheetHeader`, `SHEET_PANEL`).

## 3. Decisions

1. **All at once on drain.** Queued messages fold into one prompt, the SDK `merge` shape. `Send now` sends one row alone.
2. **Stop drains, like Grok.** No held state.
3. **No inline queued bubbles.** Claude draws them in the transcript. Porte keeps them in the pill and sheet, so the transcript stays the Host's transcript.
4. **Edit is a later slice.**

## 4. Facts from the spike

Script and logs: `scratchpad/acp-queue-spike.mjs`, `spike-run2..4.log` (session scratchpad).

| Question                                     | Grok 1.0.13 over `grok agent stdio`                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Second `session/prompt` on a running session | Not rejected. Queued server-side; request pends until the first turn ends, then runs.       |
| Queue visibility                             | `_x.ai/queue/changed { entries: [{ id, version, kind, text, position }], runningPromptId }` |
| Withdraw, edit, reorder, interject           | `x.ai/queue/*` methods exist for the TUI only. Over stdio: `-32601 Method not found`.       |
| `session/cancel` with one queued             | Running turn ends `cancelled`. Queue stays. Queued prompt starts at once.                   |
| ACP spec                                     | Silent on concurrent prompts. RFD #1261 `session/inject` (queue, steer) is open.            |
| Agents SDK `messageConcurrency`              | `queue` (default), `latest`, `merge`, `drop`, `debounce`. In memory, no per-item cancel.    |

Consequence: a message that reaches Grok cannot be withdrawn. The queue must sit above the Host.

## 5. Design

- The relay (`ConversationAgent`) owns the queue. Queued messages are user rows in the SDK message store with `metadata: { queued: true }`.
- The Host does not change. One turn at a time stays a Host invariant (`ConversationBusyError`).
- A drain starts through the SDK's `saveMessages`, which waits for the active chat turn and then runs `onChatMessage`. No hand-rolled scheduler.

### Alternatives

| Option                                  | Cancel | Durable      | Streaming of queued turn          | Verdict                                                  |
| --------------------------------------- | ------ | ------------ | --------------------------------- | -------------------------------------------------------- |
| A. Send `session/prompt` at once (Grok) | No     | Grok process | Yes                               | Rejected: no withdraw over ACP                           |
| B. Relay rows + `saveMessages` drain    | Yes    | DO storage   | Yes, same `onChatMessage` path    | Recommended                                              |
| C. Host aggregate holds the queue       | Yes    | Host RAM     | Needs stream after `turn.started` | Rejected: stream binds late, events lost until reconcile |
| D. SDK `messageConcurrency: 'queue'`    | No API | RAM only     | Yes                               | Rejected: lost on DO restart, no per-item withdraw       |

### Invariants

1. The Host starts at most one turn per conversation. Unchanged.
2. A queued row has `metadata.queued === true` and no `turnId` or `attemptId`. When started, `onChatMessage` replaces that metadata with `{ attemptId }`.
3. `onChatMessage` starts one user row: the first with no turn link. Never two.
4. The queue drains only when no stream is active and the Host reports no running turn.
5. A snapshot (`conversation.get`) never deletes queued rows. The relay keeps them by metadata.
6. Drain folds every queued row into the first one (parts concatenated, text parts joined by a blank line) and deletes the rest before the turn starts. `Send now` starts one row and leaves the rest queued.

### Domain model

```ts
// apps/web/src/lib/conversation/conversation-state-messages.ts
type RowMetadata =
  | { readonly queued: true } // waiting; relay owns it
  | { readonly attemptId: AttemptId } // turn.start sent
  | { readonly turnId: TurnId; readonly attemptId: AttemptId }
  | { readonly turnId: TurnId } // from a Host snapshot

export function isQueuedRow(row: UIMessage): boolean
/** The first user row with no turn link: the one `onChatMessage` starts. */
export function nextUserRow(messages: readonly UIMessage[]): UIMessage | undefined
/** Every queued row folded into one, in order. */
export function foldQueuedRows(rows: readonly UIMessage[]): UIMessage

// apps/web/src/features/conversation/models/message-queue.ts   (exists)
export type QueuedMessage = { id: MessageId; position: number; text: string; files: number }
export type QueueActions = {
  sendNow: (id: MessageId) => void
  remove: (id: MessageId) => void
  reorder: (id: MessageId, position: number) => void
}
export function queuedMessages(messages: readonly UIMessage[]): readonly QueuedMessage[]
```

`queued` is never undefined; an empty array is the state and the pill is not drawn. Every action is required; a story passes fakes.

### Relay callables (`ConversationAgent`)

```ts
const QueueMessageInputSchema = z.strictObject({
  id: MessageIdSchema,                    // browser-minted, stays the row id
  parts: z.array(UserPartSchema).min(1),  // text and file parts, as `sendMessage` builds them
})
const QueuedMessageRefSchema = z.strictObject({ messageId: MessageIdSchema })

@callable() queueMessage(input: QueueMessageInput): Promise<null>
/** Delete the row if still queued. Already started is a no-op. */
@callable() withdrawQueued(ref: QueuedMessageRef): Promise<null>
/** Mark this row as the next to start alone, then cancel the running turn if any. */
@callable() sendQueuedNow(ref: QueuedMessageRef): Promise<null>
@callable() reorderQueued(input: { messageId: MessageId; position: number }): Promise<null>
// Later: editQueued({ messageId, parts })
```

Absence is a no-op, never an error (idempotent, matches `turn.cancel`).

### Browser

```ts
export type ConversationAgentStub = Pick<
  ConversationAgentClient['stub'],
  | 'cancelTurn'
  | 'listCommands'
  | 'setModel'
  | 'queueMessage'
  | 'withdrawQueued'
  | 'sendQueuedNow'
  | 'reorderQueued'
>

export type MessageQueue = {
  readonly queued: readonly QueuedMessage[] // from chat.messages, never stored twice
  readonly queue: (message: { text: string; files: FileUIPart[] }) => void
  readonly actions: QueueActions
}
export function useMessageQueue(
  stub: ConversationAgentStub,
  messages: readonly UIMessage[],
): MessageQueue
```

`ComposerQueue` (exists) takes `queued` and `actions`. `ConversationChat` routes Enter to `queue` while `state.runningTurnId` is set.

### Seams

| Boundary                 | Crosses                                 | Must not cross                         |
| ------------------------ | --------------------------------------- | -------------------------------------- |
| Browser → relay callable | `QueueMessageInput`, `QueuedMessageRef` | Turn ids, attempt ids                  |
| Relay → SDK store        | User rows with `RowMetadata`            | Queue order as separate state          |
| Relay → Host             | `turn.start`, `turn.cancel` (unchanged) | The word "queue"; the Host never knows |
| Host → Grok              | `session/prompt`, `session/cancel`      | —                                      |

## 6. Call stacks

### Queue (F2, F3)

```text
Composer Enter while running
  -> useMessageQueue.queue({ text, files })
  -> stub.queueMessage({ id: generateId(), parts })
  -> ConversationAgent.queueMessage
       parse; persistMessages([...this.messages, { id, role: 'user', parts, metadata: { queued: true } }])
       (SDK broadcasts messages; every viewer's pill updates)
       drainQueue()   // no-op while a stream is active or a turn runs
```

### Drain (F4, F9, F10, F12)

```text
Host `turn.finished`
  -> acceptEvent -> close stream -> onChatResponse -> reconcileTurn
  -> drainQueue()
drainQueue()
  if activeStream || state.runningTurnId return
  rows = this.messages.filter(isQueuedRow); if rows.length === 0 return
  next = sendNow (DO storage) ? [that row] : rows        // Send now runs one row alone
  void this.saveMessages((all) => replace(all, next, foldQueuedRows(next)))
       // SDK waits for _reply, then runs onChatMessage
onChatMessage
  row = nextUserRow(this.messages)           // replaces latestUserMessage
  stamp { attemptId }, open stream, hostSocket.request('turn.start')   // rest unchanged
```

Also after `applySnapshot` when the snapshot shows no running turn.

### Send now (F5)

```text
stub.sendQueuedNow({ messageId })
  -> remember sendNow = messageId (DO storage, cleared by drain)
  -> runningTurnId ? hostSocket.request('turn.cancel', { turnId }) : drainQueue()
Host cancels -> turn.finished { cancelled } -> drainQueue() starts that row alone
```

Rapid succession: each press overwrites `sendNow` and cancels whatever runs. The last press wins.

### Remove (F7), Reorder (F6)

```text
withdrawQueued: row queued ? persistMessages(rows without row, [], { _deleteStaleRows: true }) : no-op
reorderQueued:  splice among queued rows only; persistMessages
```

### Failure

| Failure                            | Behavior                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| `turn.start` fails (offline, busy) | `startTurn` catch restores `metadata: { queued: true }`. Next snapshot drains.     |
| Drain with no un-linked row        | `onChatMessage` returns an empty closed stream; nothing persisted. Test proves it. |
| `saveMessages` returns `skipped`   | Chat was cleared; the queue went with it.                                          |
| Withdraw races with start          | Start wins: metadata is not `queued`, withdraw is a no-op.                         |

### Snapshot

`applySnapshot` rows = Host rows + active-turn rows (unchanged) + `this.messages.filter(isQueuedRow)` appended. `relay-communication.md` rule 2 gains one line: queued rows are relay-owned until started.

## 7. Files

| File                                                                       | Change                                                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/lib/conversation/conversation-state-messages.ts`             | `RowMetadata`, `isQueuedRow`, `nextUserRow`, `foldQueuedRows`                                                            |
| `apps/web/src/server/infrastructure/durable-objects/conversation-agent.ts` | Callables, `drainQueue`, `sendNow` storage, `nextUserRow` in `onChatMessage`, snapshot keeps queued rows                 |
| `apps/web/src/features/conversation/models/message-queue.ts`               | Exists. Add `queuedMessages`.                                                                                            |
| `apps/web/src/features/conversation/hooks/use-message-queue.ts`            | `useMessageQueue`                                                                                                        |
| `apps/web/src/features/conversation/hooks/use-conversation-agent.ts`       | Stub pick                                                                                                                |
| `apps/web/src/features/conversation/components/composer-queue.tsx`         | Exists: pill, sheet, drag, message page.                                                                                 |
| `apps/web/src/features/conversation/components/conversation-chat.tsx`      | Running: Enter queues; one button (Stop when empty, arrow with text); placeholder; pill; transcript gets non-queued rows |
| `apps/web/.storybook/harnesses/chat-frame.tsx`                             | Exists: `onQueue`, `queue`, `QueueOrStop`.                                                                               |
| `apps/web/.storybook/design-system/composer-queue.stories.tsx`             | Exists: `Queued`, `QueueOpen`.                                                                                           |
| `apps/web/tests/unit/conversation-state-messages.test.ts`                  | Selectors, fold                                                                                                          |
| `apps/web/tests/integration/conversation-agent.test.ts`                    | Queue, drain, fold, send now, reorder, withdraw, snapshot, start failure                                                 |
| `apps/web/tests/design/*.spec.ts`                                          | Looks, a11y, reflow for the new stories                                                                                  |
| `docs/relay-communication.md`                                              | Rule 2 line                                                                                                              |

Host: no change. Core: no change. Dependency added: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (catalog).

## 8. RGR slices

1. `nextUserRow`, `isQueuedRow`, `foldQueuedRows`, `queuedMessages`. Unit.
2. `queueMessage` during a running turn persists a queued row, sends no `turn.start`. Integration, fake Host socket.
3. `turn.finished` drains: one `turn.start` carries the folded row; `turn.started` binds the stream.
4. `sendQueuedNow` sends `turn.cancel`; after `turn.finished` that row starts alone and the rest stay queued.
5. `withdrawQueued`, `reorderQueued`.
6. `applySnapshot` keeps queued rows; idle snapshot drains. `turn.start` failure restores `queued`.
7. `useMessageQueue` with a stub fake; `ConversationChat` wiring. Design specs green.

## 9. Open questions

1. `saveMessages((rows) => …)` on an already-persisted list: confirm the SDK does not broadcast a no-op persist as a new frame. Slice 3.
2. `_reply` appends the streamed assistant row after queued rows. The transcript filters queued rows, so the screen never shows it; reconcile fixes the store. Confirm no virtualizer key jump in slice 7.
3. Two queues when the user also types in Grok's TUI. Grok's runs first. Documented, not solved.
